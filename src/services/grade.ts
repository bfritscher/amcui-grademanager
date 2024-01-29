import { reactive } from 'vue';
import Papa from 'papaparse';
import * as _ from 'lodash';

import Api from './api';
import {
  GradeRecord,
  GradeQuestion,
  Score,
  GradeFile,
  Stat,
} from '../components/models';

export default class GradeService {
  API: Api;
  grade = reactive({
    isLoading: true,
    showLoading: false,
    loadingTimeout: undefined as number | undefined,
    stats: [] as Stat[],
    files: [] as GradeFile[],
    students: {
      fields: ['id'],
      data: [] as any[],
    },
    studentsLookup: {} as { [key: string]: any },
    // pivot data
    scores: {} as { [key: string]: GradeRecord },
    unmatched: {} as { [key: string]: GradeRecord },
    questions: {} as { [key: string]: GradeQuestion },
    whys: {} as { [key: string]: string },
    maxPoints: 0,
    test: {},
  });

  constructor({ API }: { API: any }) {
    this.API = API;
  }

  startLoading() {
    this.grade.isLoading = true;
    if (!this.grade.loadingTimeout) {
      this.grade.loadingTimeout = window.setTimeout(() => {
        this.grade.showLoading = true;
      }, 1000);
    }
  }

  stopLoading() {
    if (this.grade.loadingTimeout) {
      window.clearTimeout(this.grade.loadingTimeout);
      this.grade.loadingTimeout = undefined;
    }
    this.grade.showLoading = false;
    this.grade.isLoading = false;
  }

  loadData() {
    this.startLoading();
    // reset data;
    this.grade.stats = [];
    this.grade.files = [];
    this.grade.students = {
      fields: ['id'],
      data: [],
    };
    this.grade.studentsLookup = {};
    this.API.$http
      .get(this.API.URL + '/project/' + this.API.project + '/csv')
      .then((r) => {
        this.parseCSV(r.data as string);
        this.loadScores();
      });

    this.API.$http
      .get(this.API.URL + '/project/' + this.API.project + '/stats')
      .then((r) => {
        this.grade.stats = r.data;
      });

    this.API.$http
      .get(this.API.URL + '/project/' + this.API.project + '/gradefiles')
      .then(
        (r) => {
          this.grade.files = r.data || [];
          this.grade.files.forEach((file) => {
            if (!file.meta.selected) {
              file.meta.selected = {};
            }
          });
        },
        () => {
          this.grade.files = [];
        }
      );
  }

  loadScores() {
    this.startLoading();
    this.API.$http
      .get(this.API.URL + '/project/' + this.API.project + '/scores')
      .then(
        (r: any) => {
          //pivot data
          this.grade.scores = {};
          this.grade.unmatched = {};
          this.grade.questions = {};
          this.grade.whys = {};
          this.grade.maxPoints = 0;
          r.data.forEach((row: Score) => {
            const key = row.student + ':' + row.copy;
            let id = key;
            let target: keyof { unmatched: any; scores: any } = 'unmatched';
            if (row.id && this.getStudentById(row.id)) {
              id = row.id;
              target = 'scores';
            }

            if (!this.grade[target].hasOwnProperty(id)) {
              this.grade[target][id] = {
                id: row.id,
                key: key,
                student: row.student,
                copy: row.copy,
                questions: {},
                total: 0,
              };
            }
            if (!this.grade.questions.hasOwnProperty(row.title)) {
              this.grade.questions[row.title] = {
                max: row.max,
                question: row.question,
                pages: {},
              };
              this.grade.maxPoints += row.max;
            }
            this.grade.questions[row.title].pages[row.student] = row.page;
            this.grade[target][id].total += row.score;
            this.grade[target][id].questions[row.title] = row.score;

            this.grade.whys[key + ':' + row.question] = row.why;
          });

          // initial value for custom options data
          if (!this.API.options.options.points_max) {
            this.API.options.options.points_max =
              this.grade.maxPoints.toString();
          }

          if (!this.API.options.options.final_grade_formula) {
            this.API.options.options.final_grade_formula = 'row.Grade';
          }
          this.calculateGrades();
          this.stopLoading();
        },
        () => {
          this.stopLoading();
        }
      );
  }
  // parse CSV data and integrate into into the in memory table
  // source server CSV local paste data or csv.
  // match by id key
  parseCSV(csv: string) {
    const result = Papa.parse(csv, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    });
    if (!result || !result.meta || !result.meta.fields) return;
    //merge keys
    result.meta.fields.forEach((field, index) => {
      // fix empty columns
      if (field === '') {
        field = 'Column ' + (index + 1);
        result.data.forEach((row: any) => {
          row[field] = row[''];
        })
      }
      if (this.grade.students.fields.indexOf(field) < 0) {
        this.grade.students.fields.push(field);
      }
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    result.data.forEach((row: any) => {
      if (!row.hasOwnProperty('id') || row.id === '' || row.id === null || row.id === undefined) {
        //new unique id
        row.id =
          this.grade.students.data.reduce((max: number, s: any) => {
            const current = Number(s.id);
            return isNaN(current) ? max : current > max ? current : max;
          }, 0) + 1;
      }
      // TODO-test merge data with same id? #44
      const existingRow = this.getStudentById(row.id as string|number);
      if (existingRow) {
        Object.assign(existingRow, row);
      } else {
        this.grade.students.data.push(row);
        this.grade.studentsLookup[row.id] = row;
      }
    });
    this.debounceSaveCSV();
  }

  getStudentById(id: number | string) {
    return this.grade.studentsLookup[String(id)];
  }

  removeStudent(student: any) {
    this.unmatchStudent(student);
    this.grade.students.data.splice(
      this.grade.students.data.indexOf(student),
      1
    );
    delete this.grade.studentsLookup[student.id];
  }

  unmatchStudent(student: any) {
    const score = this.grade.scores[student.id];
    if (score) {
      this.API.$http
        .post(
          this.API.URL + '/project/' + this.API.project + '/association/manual',
          {
            student: score.student,
            copy: score.copy,
            id: 'NULL',
          }
        )
        .then(() => {
          this.grade.unmatched[student.id] = score;
          delete this.grade.scores[student.id]
        });
    }
  }

  annotateScore(score: GradeRecord) {
    this.API.$http.post(
      this.API.URL + '/project/' + this.API.project + '/annotate',
      {
        ids: [score.copy ? score.student + ':' + score.copy : score.student],
      }
    );
  }

  annotateAll() {
    this.API.$http.post(
      this.API.URL + '/project/' + this.API.project + '/annotate'
    );
  }

  // file handling

  exportData() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return Papa.unparse(JSON.parse(JSON.stringify(this.grade.students)));
  }

  exportAllData() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const data = JSON.parse(JSON.stringify(this.grade.students)) as {fields: string[], data: any[]};
    Object.keys(this.grade.questions).forEach((key) => {
      data.fields.push(key);
      data.data.forEach((row) => {
        row[key] = this.grade.scores[row.id] ? this.grade.scores[row.id].questions[key] : '';
      });
    });
    return Papa.unparse(data);
  }

  makeFunc(func: string) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      return new Function(
        'row',
        'try{ return ' +
          func +
          '; } catch (e) { return `Error: ${e.message}`; }'
      );
    } catch (e: any) {
      return () => 'Error: ' + e.message;
    }
  }

  importCols(file: GradeFile) {
    const studentLookupFunc = this.makeFunc(file.studentLookup);
    const lookupValueFunc = this.makeFunc(file.fileLookup);
    //merge field
    const fields = [] as any[];
    for (const index in file.meta.selected) {
      if (file.meta.selected.hasOwnProperty(index)) {
        if (parseInt(index, 10) >= file.meta.fields.length) {
          continue;
        }
        const field = file.meta.fields[index];
        fields.push(field);
        if (this.grade.students.fields.indexOf(field) < 0) {
          this.grade.students.fields.push(field);
        }
      }
    }

    file.data.forEach((row) => {
      const lookupValue = lookupValueFunc(row);
      if (lookupValue) {
        this.grade.students.data.forEach((studentRow) => {
          if (studentLookupFunc(studentRow) === lookupValue) {
            fields.forEach((field) => {
              studentRow[field] = row[field];
            });
          }
        });
      }
    });
    this.calculateGrades();
  }

  addNewFile(data: any, name?: string) {
    if (!name) {
      name = 'CSV#' + this.grade.files.length;
    }
    Papa.parse(data, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results: any) => {
        results.name = name;
        results.studentLookup = 'row.name.toLowerCase()';
        results.fileLookup =
          '(row["First Name"]  +  " " + row.last_name).toLowerCase()';
        results.demoid = 1;
        results.meta.selected = {};
        const index = this.grade.files.push(results as GradeFile);
        this.saveFiles();
        this.API.router.push({
          name: 'Grade',
          params: {
            project: this.API.project,
            tab: `file${index - 1}`,
          },
        });
      },
    });
  }

  removeFile(file: GradeFile) {
    this.grade.files.splice(this.grade.files.indexOf(file), 1);
    this.saveFiles();
  }
  saveFiles() {
    this.API.$http.post(
      `${this.API.URL}/project/${this.API.project}/gradefiles`,
      this.grade.files
    );
  }

  renameColumn(
    currentName: string,
    newName: string,
    fields: string[],
    data: any[]
  ) {
    const index = fields.indexOf(currentName);
    if (newName && newName !== currentName) {
      fields[index] = newName;
      data.forEach((row) => {
        if (row.hasOwnProperty(currentName)) {
          row[newName] = row[currentName];
          delete row[currentName];
        }
      });
      return true;
    }
    return false;
  }

  // calc part

  minMaxRoundGrade(grade: any): number {
    if (grade === '' || isNaN(Number(grade))) {
      return NaN;
    }
    grade = parseFloat(Number(grade).toFixed(10));
    // TODO-nice note_arrondi as custom roundingFormula instead of round
    const roundingUnit = parseFloat(this.API.options.options.note_grain);
    const minGrade = parseFloat(this.API.options.options.note_min);
    const maxGrade = parseFloat(this.API.options.options.note_max);
    const roundedGrade = Math.max(
      minGrade,
      Math.min(maxGrade, Math.round(grade * (1 / roundingUnit)) * roundingUnit)
    );
    return roundedGrade;
  }

  computeScaledGrade(points: number, maxPoints: number): number {
    const minGrade = parseFloat(this.API.options.options.note_min);
    const maxGrade = parseFloat(this.API.options.options.note_max);
    return (points / maxPoints) * (maxGrade - minGrade) + minGrade;
  }

  computedRoundedScaledGrade(points: number, maxPoints: number): number {
    return this.minMaxRoundGrade(this.computeScaledGrade(points, maxPoints));
  }

  calculateGrades() {
    // ensure options exists
    if (isNaN(Number(this.API.options.options.node_grain))) {
      this.API.options.options.node_grain = '0.1';
      this.API.saveOptions();
    }
    if (isNaN(Number(this.API.options.options.note_min))) {
      this.API.options.options.note_min = '1.0';
      this.API.saveOptions();
    }
    if (isNaN(Number(this.API.options.options.note_max))) {
      this.API.options.options.note_max = '6.0';
      this.API.saveOptions();
    }
    if (!this.grade.students.fields.includes('Total')) {
      this.grade.students.fields.push('Total');
    }
    if (!this.grade.students.fields.includes('Grade')) {
      this.grade.students.fields.push('Grade');
    }
    if (!this.grade.students.fields.includes('FinalGrade')) {
      this.grade.students.fields.push('FinalGrade');
    }
    this.grade.students.data.forEach((row: {[key: string]: string|number}) => {
      const score = this.grade.scores[row.id];
      if (score) {
        // copy total to csv
        row.Total = score.total;
        // compute grade and store in csv
        row.Grade = parseFloat(
          this.computedRoundedScaledGrade(
            row.Total,
            parseFloat(this.API.options.options.points_max)
          ).toFixed(2)
        );
        // compute final grade and store in csv
        row.FinalGrade = parseFloat(
          this.minMaxRoundGrade(
            this.makeFunc(this.API.options.options.final_grade_formula)(row)
          ).toFixed(2)
        );
      } else {
        row.Total = '';
        row.Grade = '';
        row.FinalGrade = '';
      }
    });
    this.debounceSaveCSV();
  }

  saveCSV() {
    this.API.$http({
      method: 'POST',
      url: this.API.URL + '/project/' + this.API.project + '/csv',
      headers: {
        'Content-Type': 'text/plain',
      },
      data: this.exportData(),
    });
  }

  debounceSaveCSV = _.debounce(
    () => {
      if (!this.grade.isLoading) {
        this.saveCSV();
      }
    },
    2000,
    { maxWait: 10000 }
  );

  avg(rows: any[], getter: (o: any) => any): number {
    let total = 0;
    let count = 0;
    let nan = false;
    for (const row of rows) {
      const value = getter(row);
      if (value === '' || value === undefined || value === null) {
        continue;
      }
      count++;
      if (typeof value !== 'number') {
        nan = true;
      } else {
        total = total + value;
      }
    }
    if (count === 0) {
      return 0;
    }
    return nan ? count : total / count;
  }

  avgScore(getter: (o: any) => any) {
    const rows = Object.values(this.grade.scores).concat(
      Object.values(this.grade.unmatched)
    );
    return this.avg(rows, getter);
  }

  avgStudentField(name: string): number {
    return this.avg(this.grade.students.data, (o) => o[name]);
  }

  avgScoreField(name: string): number {
    return this.avgScore((o) => o[name]);
  }

  avgQuestion(col: string): number {
    return this.avgScore((o) => o.questions[col]);
  }
}
