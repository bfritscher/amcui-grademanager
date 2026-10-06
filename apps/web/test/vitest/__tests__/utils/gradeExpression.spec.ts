import { describe, expect, it, vi } from 'vitest';
import { gradeExpression } from '../../../../src/utils/gradeExpression';

describe('saved grade and lookup expressions', () => {
  it.each([
    ['row.Grade * 0.4 + row["Project Grade"] * 0.6', expect.closeTo(5.2)],
    ['Math.max(1, Math.min(6, Math.round(row.Grade * 2) / 2))', 4],
    ['row.Grade >= 4 ? "pass" : "fail"', 'pass'],
    ['(row.name + " " + row.surname).trim().toLowerCase()', 'alice example'],
    ['parseFloat(row.mark) + Number("1")', 5.5],
    ['row.missing ?? row.Grade', 4],
    ['row.Grade ** 2 % 5', 1],
    ['Math.PI > 3 && !false', true]
  ])('supports %s', (source, expected) => {
    const result = gradeExpression(source)({
      Grade: 4,
      'Project Grade': 6,
      name: ' Alice',
      surname: 'Example ',
      mark: '4.5'
    });
    expect(result).toEqual(expected);
  });

  it.each([
    'globalThis.__formulaExecuted = true',
    '(globalThis.__formulaExecuted = true, row.Grade)',
    'fetch("https://example.com", {body: document.cookie})',
    'row.constructor.constructor("globalThis.__formulaExecuted = true")()',
    'row["con" + "structor"]["constructor"]("return window")()',
    'row.name.toLowerCase.constructor("return window")()',
    'Math.max.constructor("return window")()',
    'row.__proto__',
    'row["prototype"]',
    'row.Grade = 6',
    'row.Grade++',
    '(()=>{while(true){} })()',
    'new Function("return window")()',
    'true ? 4 : alert(1)',
    'row.callback()',
    'row["toString"]()'
  ])('rejects executable or unsafe expression %s', (source) => {
    const callback = vi.fn();
    const row = { Grade: 4, name: 'Alice', callback };
    expect(String(gradeExpression(source)(row))).toMatch(/^Error:/);
    expect(row.Grade).toBe(4);
    expect(callback).not.toHaveBeenCalled();
    expect((globalThis as any).__formulaExecuted).toBeUndefined();
  });

  it('does not invoke accessors, inherited fields or object coercion hooks', () => {
    const sideEffect = vi.fn();
    expect(
      gradeExpression('row.secret')({
        get secret() {
          sideEffect();
          return 6;
        }
      })
    ).toMatch(/^Error:/);
    expect(gradeExpression('row.Grade')(Object.create({ Grade: 6 }))).toBeUndefined();
    expect(gradeExpression('row.value + 1')({ value: { valueOf: sideEffect } })).toMatch(/^Error:/);
    expect(sideEffect).not.toHaveBeenCalled();
  });
});
