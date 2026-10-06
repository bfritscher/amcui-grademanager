import { parse } from 'acorn';

type Evaluate = (row: unknown) => any;
const hasOwn = (object: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(object, key);
const forbidden = new Set(['constructor', 'prototype', '__proto__']);
const math = Object.freeze({
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
  trunc: Math.trunc,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  sqrt: Math.sqrt,
  log: Math.log,
  exp: Math.exp,
  sign: Math.sign,
  PI: Math.PI,
  E: Math.E
});
const strings = Object.freeze({
  toLowerCase: String.prototype.toLowerCase,
  toUpperCase: String.prototype.toUpperCase,
  trim: String.prototype.trim,
  slice: String.prototype.slice,
  substring: String.prototype.substring,
  charAt: String.prototype.charAt,
  includes: String.prototype.includes,
  startsWith: String.prototype.startsWith,
  endsWith: String.prototype.endsWith
});
const functions = Object.freeze({ Number, String, parseFloat, parseInt, isNaN, isFinite });

function scalar(value: any): any {
  if (value !== null && !['undefined', 'string', 'number', 'boolean'].includes(typeof value))
    throw new Error('Expected a scalar value');
  return value;
}
function property(value: any, key: any): any {
  key = String(scalar(key));
  if (forbidden.has(key)) throw new Error('Forbidden property');
  if (value === null || value === undefined)
    throw new Error(`Cannot read properties of ${value} (reading '${key}')`);
  if (typeof value === 'string' && key === 'length') return value.length;
  const descriptor = Object.getOwnPropertyDescriptor(Object(value), key);
  if (!descriptor) return undefined;
  if (!hasOwn(descriptor, 'value')) throw new Error('Accessors are not supported');
  return descriptor.value;
}

// Interpret a limited expression grammar. Never compile saved text as JavaScript.
export function gradeExpression(source: string): Evaluate {
  try {
    if (typeof source !== 'string' || source.length > 10_000) throw new Error('Invalid formula');
    const program = parse(source, { ecmaVersion: 2022 });
    if (program.body.length !== 1 || program.body[0].type !== 'ExpressionStatement')
      throw new Error('Expected one expression');
    let count = 0;
    const compile = (node: any, depth = 0): Evaluate => {
      if (++count > 1000 || depth > 100) throw new Error('Formula is too complex');
      const child = (value: any) => compile(value, depth + 1);
      switch (node.type) {
        case 'Literal':
          scalar(node.value);
          return () => node.value;
        case 'Identifier':
          if (node.name === 'row') return (row) => row;
          if (node.name === 'Math') return () => math;
          if (node.name === 'undefined') return () => undefined;
          if (node.name === 'NaN') return () => NaN;
          if (node.name === 'Infinity') return () => Infinity;
          throw new Error(`Unsupported name: ${node.name}`);
        case 'MemberExpression': {
          const object = child(node.object);
          const key = node.computed ? child(node.property) : () => node.property.name;
          if (!node.computed && forbidden.has(node.property.name))
            throw new Error('Forbidden property');
          return (row) => property(object(row), key(row));
        }
        case 'UnaryExpression': {
          if (!['+', '-', '!'].includes(node.operator))
            throw new Error('Unsupported unary operator');
          const argument = child(node.argument);
          return (row) => {
            const value = scalar(argument(row));
            if (node.operator === '+') return +value;
            if (node.operator === '-') return -value;
            return !value;
          };
        }
        case 'BinaryExpression': {
          const supported = [
            '+',
            '-',
            '*',
            '/',
            '%',
            '**',
            '<',
            '<=',
            '>',
            '>=',
            '===',
            '!==',
            '==',
            '!='
          ];
          if (!supported.includes(node.operator)) throw new Error('Unsupported binary operator');
          const left = child(node.left),
            right = child(node.right);
          return (row) => {
            const a = scalar(left(row)),
              b = scalar(right(row));
            switch (node.operator) {
              case '+':
                return a + b;
              case '-':
                return a - b;
              case '*':
                return a * b;
              case '/':
                return a / b;
              case '%':
                return a % b;
              case '**':
                return a ** b;
              case '<':
                return a < b;
              case '<=':
                return a <= b;
              case '>':
                return a > b;
              case '>=':
                return a >= b;
              case '===':
                return a === b;
              case '!==':
                return a !== b;
              case '==':
                return a == b;
              case '!=':
                return a != b;
            }
          };
        }
        case 'LogicalExpression': {
          const left = child(node.left),
            right = child(node.right);
          return (row) => {
            const value = scalar(left(row));
            if (node.operator === '&&') return value && right(row);
            if (node.operator === '||') return value || right(row);
            if (node.operator === '??') return value ?? right(row);
            throw new Error('Unsupported logical operator');
          };
        }
        case 'ConditionalExpression': {
          const test = child(node.test),
            yes = child(node.consequent),
            no = child(node.alternate);
          return (row) => (scalar(test(row)) ? yes(row) : no(row));
        }
        case 'CallExpression': {
          if (node.arguments.length > 20) throw new Error('Too many arguments');
          const args = node.arguments.map(child);
          if (node.callee.type === 'Identifier' && hasOwn(functions, node.callee.name)) {
            const fn = functions[node.callee.name as keyof typeof functions] as (
              ...args: any[]
            ) => any;
            return (row) => fn(...args.map((arg: Evaluate) => scalar(arg(row))));
          }
          if (node.callee.type !== 'MemberExpression' || node.callee.computed)
            throw new Error('Unsupported function call');
          const name = node.callee.property.name;
          if (
            node.callee.object.type === 'Identifier' &&
            node.callee.object.name === 'Math' &&
            hasOwn(math, name) &&
            typeof math[name as keyof typeof math] === 'function'
          ) {
            const fn = math[name as keyof typeof math] as (...args: number[]) => number;
            return (row) => fn(...args.map((arg: Evaluate) => scalar(arg(row))));
          }
          if (!hasOwn(strings, name)) throw new Error('Unsupported function call');
          const object = child(node.callee.object);
          const fn = strings[name as keyof typeof strings] as (...args: any[]) => any;
          return (row) => {
            const value = object(row);
            if (typeof value !== 'string') throw new Error('Expected a string');
            return fn.call(value, ...args.map((arg: Evaluate) => scalar(arg(row))));
          };
        }
        default:
          throw new Error(`Unsupported expression: ${node.type}`);
      }
    };
    const evaluate = compile(program.body[0].expression);
    return (row) => {
      try {
        return scalar(evaluate(row));
      } catch (error) {
        return `Error: ${(error as Error).message}`;
      }
    };
  } catch (error) {
    return () => `Error: ${(error as Error).message}`;
  }
}
