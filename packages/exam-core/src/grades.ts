import { gradeExpression } from './gradeExpression.js';

export function roundGrade(value: unknown, options: Record<string, string>): number {
  if (value === '' || !Number.isFinite(Number(value))) return NaN;
  const grade = parseFloat(Number(value).toFixed(10));
  const unit = parseFloat(options.note_grain || '0.1');
  const min = parseFloat(options.note_min || '1');
  const max = parseFloat(options.note_max || '6');
  if (!(unit > 0) || !Number.isFinite(min) || !Number.isFinite(max) || max < min) return NaN;
  return Math.max(min, Math.min(max, Math.round(grade * (1 / unit)) * unit));
}

export function scaledGrade(points: number, maxPoints: number, options: Record<string, string>): number {
  const min = parseFloat(options.note_min || '1');
  const max = parseFloat(options.note_max || '6');
  return (points / maxPoints) * (max - min) + min;
}

export function finalGrades(row: Record<string, unknown>, total: number, options: Record<string, string>) {
  const Grade = parseFloat(roundGrade(scaledGrade(total, parseFloat(options.points_max), options), options).toFixed(2));
  const result = gradeExpression(options.final_grade_formula || 'row.Grade')({ ...row, Total: total, Grade });
  const FinalGrade = parseFloat(roundGrade(result, options).toFixed(2));
  if (!Number.isFinite(Grade) || !Number.isFinite(FinalGrade)) throw new Error('Invalid final grade or formula');
  return { Total: total, Grade, FinalGrade };
}
