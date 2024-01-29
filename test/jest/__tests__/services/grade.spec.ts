import { describe, expect, it, jest } from '@jest/globals';
import GradeService from '../../../../src/services/grade';
import * as path from 'path';
import * as fs from 'fs';

describe('Grade', () => {
  describe('loading students.csv', () => {
    it('should load and merge students.csv', () => {
      const gs = new GradeService({ API: {} });
      const s1 = { id: '101', name: 'test' };
      gs.grade.students = {
        fields: ['id', 'name'],
        data: [s1],
      };
      gs.grade.studentsLookup = {
        '101': s1,
      }
      gs.parseCSV('id,name,project\r\n101,a,4.5\r\n,103,b,2.0');
      expect(gs.grade.students.data.length).toBe(2);
      expect(gs.grade.students.data[0].project).toBe(4.5);
      expect(gs.grade.students.fields).toEqual(['id', 'name', 'project']);
    });
    it('should add unique ids', () => {
      const gs = new GradeService({ API: {} });
      gs.grade.students = {
        fields: ['id', 'name'],
        data: [{ id: '3', name: 'test' }],
      };
      gs.parseCSV('name,project\r\na,4.5\r\n,b,2.0');
      expect(gs.grade.students.data.length).toBe(3);
      expect(gs.grade.students.data[1].id).toBe(4);
      expect(gs.grade.students.data[2].id).toBe(5);
    });
  });

  describe('grade computations', () => {
    it('computeScaledGrade', () => {
      const API: any = {
        options: {
          options: {
            note_min: '1.0',
            note_max: '6.0',
          },
        },
      };
      const gs = new GradeService({ API });
      expect(gs.computeScaledGrade(10, 10)).toBe(6.0);
      expect(gs.computeScaledGrade(5, 10)).toBe(3.5);
      expect(gs.computeScaledGrade(6, 10)).toBe(4.0);
      expect(gs.computeScaledGrade(0, 10)).toBe(1.0);
    });

    it('minMaxRoundGrade', () => {
      const API: any = {
        options: {
          options: {
            note_min: '1.0',
            note_max: '6.0',
            note_grain: '0.1',
          },
        },
      };
      const gs = new GradeService({ API });
      expect(gs.minMaxRoundGrade(7.3)).toBe(6.0);
      expect(gs.minMaxRoundGrade(0.2)).toBe(1.0);
      expect(gs.minMaxRoundGrade(4.5)).toBe(4.5);
      expect(gs.minMaxRoundGrade(4.55).toFixed(2)).toBe('4.60');
      expect(gs.minMaxRoundGrade(4.59).toFixed(2)).toBe('4.60');
      expect(gs.minMaxRoundGrade(4.49)).toBe(4.5);
      // 4.949999999999999
      expect(gs.minMaxRoundGrade(6*0.3+4.5*0.7)).toBe(5);
      API.options.options.note_grain = '0.5';
      expect(gs.minMaxRoundGrade(4.0)).toBe(4.0);
      expect(gs.minMaxRoundGrade(4.55).toFixed(2)).toBe('4.50');
      expect(gs.minMaxRoundGrade(4.59).toFixed(2)).toBe('4.50');
      expect(gs.minMaxRoundGrade(4.75).toFixed(2)).toBe('5.00');
      expect(gs.minMaxRoundGrade(4.49)).toBe(4.5);
      expect(gs.minMaxRoundGrade(4.25)).toBe(4.5);
      expect(gs.minMaxRoundGrade(4.2)).toBe(4.0);
      expect(gs.minMaxRoundGrade('')).toEqual(NaN);
      expect(gs.minMaxRoundGrade('Error')).toEqual(NaN);
    });

    it('computedRoundedScaledGrade', () => {
      const API: any = {
        options: {
          options: {
            note_min: '1.0',
            note_max: '6.0',
            note_grain: '0.1',
          },
        },
      };
      const gs = new GradeService({ API });
      expect(gs.computedRoundedScaledGrade(15, 20).toFixed(2)).toBe('4.80');
      expect(gs.computedRoundedScaledGrade(25, 20)).toBe(6.0);
    });

    it('set grade to fixed length to handle float', () => {
      const API: any = {
        project: 'test',
        URL: 'test',
        $http: jest.fn(),
        saveOptions: jest.fn(),
        options: {
          options: {
            note_min: '1.0',
            note_max: '6.0',
            note_grain: '0.1',
            points_max: '9',
            final_grade_formula: 'row.Grade * 1.7',
          },
        },
      };
      const gs = new GradeService({ API });
      gs.grade.scores = {
        '1': {
          id: '1',
          key: '1',
          student: 1,
          copy: 1,
          questions: { Q01: 2 },
          total: 4,
        },
      };
      gs.grade.students = {
        fields: ['id', 'name'],
        data: [{ id: '1', name: 'test', Grade: '4.0' }],
      };
      gs.calculateGrades();
      expect(gs.grade.students.fields).toEqual(
        expect.arrayContaining(['id', 'name', 'Grade', 'Total', 'FinalGrade'])
      );
      expect(gs.grade.students.data[0]).toEqual(
        expect.objectContaining({
          id: '1',
          name: 'test',
          Grade: 3.2,
          Total: 4,
          FinalGrade: 5.4,
        })
      );
    });
    it('set works with broken final_grade_formula', () => {
      const API: any = {
        project: 'test',
        URL: 'test',
        $http: jest.fn(),
        saveOptions: jest.fn(),
        options: {
          options: {
            note_min: '1.0',
            note_max: '6.0',
            note_grain: '0.1',
            points_max: '',
            final_grade_formula: 'row.Grade.. * 1.7',
          },
        },
      };
      const gs = new GradeService({ API });
      gs.grade.scores = {
        '1': {
          id: '1',
          key: '1',
          student: 1,
          copy: 1,
          questions: { Q01: 2 },
          total: 4,
        },
      };
      gs.grade.students = {
        fields: ['id', 'name'],
        data: [{ id: '1', name: 'test', Grade: '4.0' }],
      };
      gs.calculateGrades();
      expect(gs.grade.students.fields).toEqual(
        expect.arrayContaining(['id', 'name', 'Grade', 'Total', 'FinalGrade'])
      );
      expect(gs.grade.students.data[0]).toEqual(
        expect.objectContaining({
          id: '1',
          name: 'test',
          Grade: NaN,
          Total: 4,
          FinalGrade: NaN,
        })
      );
    });
    it('set works with no score', () => {
      const API: any = {
        project: 'test',
        URL: 'test',
        $http: jest.fn(),
        saveOptions: jest.fn(),
        options: {
          options: {
            note_min: '1.0',
            note_max: '6.0',
            note_grain: '0.1',
            points_max: '',
            final_grade_formula: 'row.Grade.. * 1.7',
          },
        },
      };
      const gs = new GradeService({ API });
      gs.grade.scores = {};
      gs.grade.students = {
        fields: ['id', 'name'],
        data: [{ id: '1', name: 'test', Grade: '4.0' }],
      };
      gs.calculateGrades();
      expect(gs.grade.students.fields).toEqual(
        expect.arrayContaining(['id', 'name', 'Grade', 'Total', 'FinalGrade'])
      );
      expect(gs.grade.students.data[0]).toEqual(
        expect.objectContaining({
          id: '1',
          name: 'test',
          Grade: '',
          Total: '',
          FinalGrade: '',
        })
      );
    });
  });

  describe('makeFunc', () => {
    it('makeFunc create a function with one row parameter', () => {
      const gs = new GradeService({ API: {} });
      const func = gs.makeFunc('row.name');
      expect(func({ name: 'test' })).toBe('test');
    });

    it('makeFunc catch syntax error', () => {
      const gs = new GradeService({ API: {} });
      const func = gs.makeFunc('row..name');
      expect(func({ name: 'test' })).toBe("Error: Unexpected token '.'");
    });

    it('makeFunc catch code error with valid syntax', () => {
      const gs = new GradeService({ API: {} });
      const func = gs.makeFunc('row.not.defined');
      expect(func({ name: 'test' })).toBe(
        "Error: Cannot read properties of undefined (reading 'defined')"
      );
    });
  });

  it('export Data from students', () => {
    const gs = new GradeService({ API: {} });
    gs.grade.students = {
      fields: ['id', 'Grade', 'name'],
      data: [{ id: '1', name: 'test', Grade: '4.0' }],
    };
    expect(gs.exportData()).toBe('id,Grade,name\r\n1,4.0,test');
  });

  it('saveCSV sends a csv', () => {
    const API: any = {
      project: 'test',
      URL: 'test',
      $http: jest.fn(),
    };
    const gs = new GradeService({ API });
    gs.grade.students = {
      fields: ['id', 'Grade', 'name'],
      data: [{ id: '1', name: 'test', Grade: '4.0' }],
    };
    gs.saveCSV();
    expect(API.$http.mock.calls[0][0].data).toBe('id,Grade,name\r\n1,4.0,test');
  });

  describe('avg computation', () => {
    it('computes avg of a column in the array', () => {
      const gs = new GradeService({ API: {} });
      const result = gs.avg(
        [{ a: 2.3 }, { a: 4.5 }, { b: 3.0, a: 4.6 }],
        (a) => a.a
      );
      expect(result.toFixed(2)).toBe('3.80');
    });

    it('avg works on empty list', () => {
      const gs = new GradeService({ API: {} });
      const result = gs.avg([], (a) => a.a);
      expect(result).toBe(0);
    });

    it('ignores empty values avg of a column in the array', () => {
      const gs = new GradeService({ API: {} });
      const result = gs.avg(
        [{ a: 2 }, { a: null }, { a: '' }, { a: undefined }, { b: 3.0, a: 4 }],
        (a) => a.a
      );
      expect(result).toBe(3.0);
    });

    it('avg returns count of non empty if non numeric', () => {
      const gs = new GradeService({ API: {} });
      const result = gs.avg(
        [
          { a: 2 },
          { a: null },
          { a: '' },
          { a: undefined },
          { b: 3.0, a: 'demo' },
        ],
        (a) => a.a
      );
      expect(result).toBe(2);
    });
  });

  it('avgQuestion reads from scores and unmatched through avgScore', () => {
    const gs = new GradeService({ API: {} });
    gs.grade.scores = {
      '1': {
        id: '1',
        key: '1',
        student: 1,
        copy: 1,
        questions: { Q01: 2 },
        total: 10,
      },
    };
    gs.grade.unmatched = {
      '1': {
        id: '1',
        key: '1',
        student: 1,
        copy: 1,
        questions: { Q03: 2, Q01: 4 },
        total: 10,
      },
    };
    const result = gs.avgQuestion('Q01');
    expect(result.toFixed(2)).toBe('3.00');
  });

  it('compute full example', () => {
    const $http = jest.fn() as any;
    $http.get = jest.fn((url: string) => {
      if (url.includes('csv')) {
        return Promise.resolve({
          data: fs.readFileSync(
            path.resolve(__dirname, './students.in.csv'),
            'utf8'
          ),
        });
      }
      if (url.includes('scores')) {
        return Promise.resolve({
          data: JSON.parse(
            fs.readFileSync(path.resolve(__dirname, './scores.json'), 'utf-8')
          ),
        });
      }
      return Promise.resolve({});
    });
    $http.post = jest.fn();
    const API: any = {
      project: 'test',
      URL: 'test',
      $http,
      saveOptions: jest.fn(),
      options: {
        options: {
          note_min: '1',
          note_max: '6',
          note_grain: '0.1',
          points_max: '26',
          final_grade_formula:
            'row.Grade*0.4 + row.Rapport*0.3 + row.Processus * 0.05  + row.Donnees * 0.05  + row.Integration * 0.05  + row.ERPsim * 0.15',
        },
      },
    };
    const gs = new GradeService({ API });
    gs.loadData();
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(gs.grade.students.fields).toEqual(
          expect.arrayContaining([
            'id',
            'Processus',
            'Donnees',
            'Integration',
            'ERPsim',
            'Rapport',
            'Total',
            'Grade',
            'FinalGrade',
          ])
        );
        expect(API.$http.mock.calls[0][0].data).toBe(
          fs.readFileSync(path.resolve(__dirname, './students.out.csv'), 'utf8')
        );
        resolve();
      }, 3000);
    });
  });
});
