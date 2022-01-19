import diffsync from 'diffsync';
import { Store } from 'vuex';
import { StateInterface } from '../store';
import { Router, RouteLocationRaw } from 'vue-router';
import { v4 as uuidv4 } from 'uuid';
import latexToExam from './latexToExam';
import examToLatex from './examToLatex';
import examToMoodle from './examToMoodle';
import examToHTML from './examToHTML';
import { Notify, Dialog } from 'quasar';
import Api from './api';
import {
  ExamData,
  Exam,
  Section,
  Answer,
  Question,
  Graphics,
  Code,
} from '../components/models';

import * as _ from 'lodash';

export default class ExamEditor {
  store: Store<StateInterface>;
  router: Router;
  API: Api;

  exam: Exam = {
    sections: [],
    properties: {},
    source: '',
    codes: {},
    graphics: {},
  };

  serverUpdate = 0;

  currentQuestion?: Question;

  copy = {
    enabled: false,
    data: {} as { [key: string]: Section },
    selected: new Set<string>(),
  };

  client: any;
  loadedProject?: string;

  constructor({
    store,
    router,
    API,
  }: {
    store: Store<StateInterface>;
    router: Router;
    API: any;
  }) {
    this.store = store;
    this.router = router;
    this.API = API;
  }

  preview() {
    const data = this.toLatex();
    data.source = this.exam.source;
    data.codes = this.exam.codes;
    this.API.preview(data);
  }

  print() {
    const print = () => {
      const data = this.toLatex();
      data.source = this.exam.source;
      data.codes = this.exam.codes;
      this.API.print(data);
    };

    if (this.API.options.status.scanned) {
      Dialog.create({
        title: 'Warning!',
        message:
          'Papers analysis was already made on the basis of the current working documents. If you modify working documents, you will not be capable any more of analyzing the papers you have already distributed!',
        cancel: true,
        ok: 'Print & Overwrite',
        color: 'negative',
        persistent: true,
        noEscDismiss: true,
        noBackdropDismiss: true,
      }).onOk(() => {
        print();
      });
    } else {
      print();
    }
  }

  load(callback: (client: any) => void) {
    const log = this.API.newLog('loading exam');
    if (this.client) {
      this.client.removeAllListeners();
    }
    this.loadedProject = undefined;
    this.exam = {
      sections: [],
      properties: {},
      source: '',
      codes: {},
      graphics: {},
    };
    const client = new diffsync.Client(this.API.socket, this.API.project);
    this.client = client;
    client.on('connected', () => {
      // the initial data has been loaded,
      // you can initialize your application
      this.exam = _.cloneDeep(client.getData());
      this.serverUpdate = 0;
      this.loadedProject = this.API.project;
      // ensure right object form
      if (!this.exam.sections) {
        this.exam.sections = [];
      }
      if (this.exam.sections.length === 0) {
        this.addSection(this.createSection());
      }
      if (!this.exam.properties) {
        this.exam.properties = {};
      }
      if (!this.exam.codes) {
        this.exam.codes = {};
      }
      if (!this.exam.graphics) {
        this.exam.graphics = {};
      }

      // TODO-nice via assign of createSection, createQuestion
      this.exam.sections.forEach((section) => {
        if (typeof section.level === 'string') {
          section.level = parseInt(section.level, 10);
        }
        if (typeof section.columns === 'string') {
          section.columns = parseInt(section.columns, 10);
        }
        if (!section.questions) {
          section.questions = [];
        }
        section.questions.forEach((question) => {
          if (typeof question.columns === 'string') {
            question.columns = parseInt(question.columns, 10);
          }
          if (typeof question.lines === 'string') {
            question.lines = parseInt(question.lines, 10);
          }
          if (!question.hasOwnProperty('lineup')) {
            question.lineup = false;
          }
          if (!question.hasOwnProperty('boxedAnswers')) {
            question.boxedAnswers = false;
          }
          if (!question.answers) {
            question.answers = [];
          }
        });
      });

      this.handleCopy();
      this.handleImport();
      callback(client);
      log.end = new Date();
      log.progress = 1;
    });

    client.on('synced', () => {
      // an update from the server has been applied
      // you can perform the updates in your application now
      this.exam = _.cloneDeep(client.getData());
    });

    client.on('error', (err: any) => {
      // an update from the server has been applied
      // you can perform the updates in your application now
      console.log('error', err);
    });

    if (this.API.socket.connected) {
      setTimeout(() => {
        client.initialize();
      }, 500);
    } else {
      this.API.socket.on('connect', () => {
        setTimeout(() => {
          client.initialize();
        }, 500);
      });
    }
  }

  importJSON(obj: any) {
    if (typeof obj === 'string') {
      obj = JSON.parse(obj);
    }
    this.exam = JSON.parse(JSON.stringify(obj));
  }

  loadTemplate(name: string) {
    this.API.loadTemplate(name).then((source) => {
      if (this.exam) {
        this.exam.source = source;
      }
    });
  }

  createSection(): Section {
    return {
      id: 's' + uuidv4(),
      title: 'Add Section',
      content: '<p></p>',
      level: 0,
      isNumbered: true,
      isSectionTitleVisibleOnAMC: true,
      shuffle: false,
      columns: 1,
      pageBreakBefore: false,
      questions: [],
    };
  }

  addSection(section: Section): number {
    return this.exam.sections.push(section) - 1;
  }

  removeSection(section: Section): number {
    let index = this.exam.sections.indexOf(section);
    this.exam.sections.splice(index, 1);
    index--;
    if (index < 0) {
      index = 0;
    }
    if (this.exam.sections.length === 0) {
      this.addSection(this.createSection());
      index = 0;
    }
    return index;
  }

  createQuestion(): Question {
    return {
      id: 'q' + uuidv4(),
      content: '<p></p>',
      type: 'SINGLE',
      layout: 'VERTICAL',
      ordered: false,
      scoring: '',
      points: 1,
      dots: false,
      lines: 3,
      columns: 1,
      lineup: false,
      boxedAnswers: false,
      answers: [],
    };
  }

  addQuestion(section: Section) {
    //copy type from previous question
    let previous;
    if (section.questions && section.questions.length > 0) {
      previous = section.questions[section.questions.length - 1];
    }

    const question = this.createQuestion();
    if (previous) {
      question.type = previous.type;
      question.columns = previous.columns;
    }
    if (question.type !== 'OPEN') {
      this.addAnswer(question);
      this.addAnswer(question);
    }

    section.questions.push(question);
    return question;
  }

  copyQuestion(section: Section, question: Question) {
    const copy = this.addQuestion(section);
    copy.content = question.content;
    copy.type = question.type;
    copy.layout = question.layout;
    copy.ordered = question.ordered;
    copy.scoring = question.scoring;
    copy.points = question.points;
    copy.dots = question.dots;
    copy.lines = question.lines;
    copy.columns = question.columns;
    copy.boxedAnswers = question.boxedAnswers;
    copy.answers = [];

    question.answers.forEach((answer) => {
      this.copyAnswer(copy, answer);
    });
    return copy;
  }

  removeQuestion(section: Section, question: Question) {
    section.questions.splice(section.questions.indexOf(question), 1);
  }

  addAnswer(question: Question) {
    const answer = {
      id: 'a' + uuidv4(),
      content: '<p></p>',
      correct: false,
    };
    question.answers.push(answer);
    return answer;
  }

  copyAnswer(question: Question, answer: Answer) {
    const copy = this.addAnswer(question);
    copy.content = answer.content;
    copy.correct = answer.correct;
    return copy;
  }

  removeAnswer(question: Question, answer: Answer) {
    question.answers.splice(question.answers.indexOf(answer), 1);
  }

  createGraphics(): Graphics {
    return {
      id: 'g' + uuidv4(),
      border: false,
      width: 0.7,
      name: '',
    };
  }

  addGraphics(graphics: Graphics) {
    if (!this.exam.graphics) {
      this.exam.graphics = {};
    }
    this.exam.graphics[graphics.id] = graphics;
  }

  deleteGraphics(graphics: Graphics) {
    this.API.deleteGraphics(graphics).then(() => {
      delete this.exam.graphics[graphics.id];
    });
  }

  syncGraphics() {
    this.API.$http
      .get(this.API.URL + '/project/' + this.API.project + '/graphics/sync')
      .then((r: any) => {
        r.data.forEach((filename: string) => {
          const id = filename.replace(/(.*)\..*?$/, '$1');
          if (!this.exam.hasOwnProperty('graphics')) {
            this.exam.graphics = {};
          }
          if (!this.exam.graphics.hasOwnProperty(id)) {
            const graphics = this.createGraphics();
            graphics.name = filename;
            graphics.id = id;
            this.addGraphics(graphics);
          }
        });
      });
  }

  addCode(id: string) {
    const code: Code = {
      id: id,
      border: true,
      mode: '',
      numbers: false,
      content: '',
    };
    if (!this.exam.codes) {
      this.exam.codes = {};
    }
    this.exam.codes[code.id] = code;
    return code;
  }

  getCode(id: string | null, create?: boolean) {
    if (
      id &&
      this.exam &&
      this.exam.codes &&
      this.exam.codes.hasOwnProperty(id)
    ) {
      return this.exam.codes[id];
    } else {
      if (id && create) {
        return this.addCode(id);
      }
    }
    return undefined;
  }

  computeHierarchyNumbers() {
    let questionCount = 1;
    const sections = [0, 0, 0];
    for (let s = 0; s < this.exam.sections.length; s++) {
      const section = this.exam.sections[s];
      if (section.isNumbered) {
        let label = '';
        for (let i = 0; i < 3; i++) {
          const level =
            typeof section.level === 'number'
              ? section.level
              : parseInt(section.level, 10);
          if (level === i) {
            sections[i]++;
          }
          if (i > 0) {
            label += '.';
          }
          label += sections[i];
          if (level === i) {
            //reset numbering below
            for (let j = i + 1; j < 3; j++) {
              sections[j] = 0;
            }
            section.number = label;
            break;
          }
        }
      } else {
        section.number = '';
      }
      for (let q = 0; q < section.questions.length; q++) {
        const question = section.questions[q];
        question.number = questionCount;
        questionCount++;
        //validate question
        question.isValid =
          (question.type === 'OPEN' ? true : question.answers.length > 0) &&
          (question.type === 'SINGLE'
            ? question.answers.reduce((a, b) => {
                return a + +b.correct;
              }, 0) === 1
            : true);
      }
    }
  }

  graphicsPreviewURL(id: string) {
    return (
      this.API.PROJECT_URL +
      '/static/src/graphics/' +
      id +
      '_thumb.jpg?token=' +
      this.store.state.token
    );
  }

  getJSON() {
    return JSON.stringify(this.exam, null, 2);
  }

  getGraphics(id: string | null) {
    if (
      id &&
      this.exam &&
      this.exam.graphics &&
      this.exam.graphics.hasOwnProperty(id)
    ) {
      return this.exam.graphics[id];
    }
    return undefined;
  }

  getGraphicsByName(name: string) {
    if (this.exam && this.exam.graphics) {
      for (const key in this.exam.graphics) {
        if (this.exam.graphics[key].name === name) {
          return this.exam.graphics[key];
        }
      }
    }
    return undefined;
  }

  importLatex(latex: string) {
    latexToExam(latex, this);
  }

  toLatex(): ExamData {
    return examToLatex(this);
  }

  toMoodleQuiz() {
    examToMoodle(this);
  }

  toHtml() {
    examToHTML(this);
  }

  linkToQuestion(section: Section, question?: Question) {
    const route: RouteLocationRaw = {
      name: 'Edit',
      params: {
        project: this.API.project,
        sectionIndex: this.exam.sections.indexOf(section),
      },
    };
    if (question) {
      route.hash = `#q${question.number}`;
    }
    return this.router.resolve(route);
  }

  AMCUI_COPY_KEY = 'AMCUI_COPY_KEY';

  copyTo(name: string) {
    const copy = {
      src: this.API.project,
      dest: name,
      sections: this.copy.data,
      graphics: {},
      codes: {},
    };
    // TODO-nice: filter code and graphics to be copied #54
    copy.graphics = this.exam.graphics;
    copy.codes = this.exam.codes;
    localStorage.setItem(this.AMCUI_COPY_KEY, JSON.stringify(copy));
    this.router.push({ name: 'Edit', params: { project: name } });
  }

  toggleCopy(section: Section, question?: Question) {
    let sectionCopy, questionCopy;
    if (this.copy.data.hasOwnProperty(section.id)) {
      sectionCopy = this.copy.data[section.id];
      if (question) {
        //question handle
        questionCopy = sectionCopy.questions.find((q) => q.id === question.id);
        if (questionCopy) {
          //remove
          sectionCopy.questions.splice(
            sectionCopy.questions.indexOf(questionCopy),
            1
          );
          this.copy.selected.delete(question.id);
        } else {
          //add
          sectionCopy.questions.splice(
            section.questions.indexOf(question),
            0,
            JSON.parse(JSON.stringify(question)) as Question
          );
          this.copy.selected.add(question.id);
        }
      } else {
        //remove section
        sectionCopy.questions.forEach((q) => {
          this.copy.selected.delete(q.id);
        });
        this.copy.selected.delete(section.id);
        delete this.copy.data[section.id];
      }
    } else {
      //add section copy
      sectionCopy = JSON.parse(JSON.stringify(section)) as Section;
      this.copy.data[section.id] = sectionCopy;
      this.copy.selected.add(sectionCopy.id);
      //add question
      if (question) {
        sectionCopy.questions = [];
        sectionCopy.questions.splice(
          section.questions.indexOf(question),
          0,
          JSON.parse(JSON.stringify(question)) as Question
        );
        this.copy.selected.add(question.id);
      } else {
        //add all
        sectionCopy.questions.forEach((q: Question) => {
          this.copy.selected.add(q.id);
        });
      }
    }
  }

  handleCopy() {
    const copySrc = localStorage.getItem(this.AMCUI_COPY_KEY) as string;
    if (!copySrc) return;
    const copy = JSON.parse(copySrc);
    if (copy.dest !== this.API.project) return;
    for (const key in copy.sections) {
      if (copy.sections.hasOwnProperty(key)) {
        const section = copy.sections[key] as Section;
        section.id = 's' + uuidv4();
        section.questions = section.questions.map((question: Question) => {
          return this.copyQuestion(section, question);
        });
        this.exam.sections.push(section);
      }
    }
    if (!this.exam.graphics) {
      this.exam.graphics = {};
    }
    if (!this.exam.codes) {
      this.exam.codes = {};
    }
    Object.assign(this.exam.graphics, copy.graphics);
    Object.assign(this.exam.codes, copy.codes);
    this.API.copyGraphics(copy.src as string, copy.dest as string);
    this.API.copyCodes(copy.src as string, copy.dest as string);
    localStorage.removeItem(this.AMCUI_COPY_KEY);
    this.copy.enabled = false;
    this.copy.selected.clear();
    this.copy.data = {};
    Notify.create({
      type: 'positive',
      message: 'Content has been copied!',
      position: 'top-right',
    });
  }
  handleImport() {
    const copy = localStorage.getItem('AMCUI_IMPORT_KEY');
    if (copy) {
      this.importJSON(copy);
      localStorage.removeItem('AMCUI_IMPORT_KEY');
      // TODO-test check if reload required
    }
  }
}
