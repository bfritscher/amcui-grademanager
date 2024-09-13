import { computed, ref, watchEffect, type Ref } from 'vue';
import { type RouteLocationRaw, useRouter } from 'vue-router';
import { v4 as uuidv4 } from 'uuid';
import latexToExam from '../services/latexToExam';
import examToLatex from '../services/examToLatex';
import examToMoodle from '../services/examToMoodle';
import examToHTML from '../services/examToHTML';
import { Notify, Dialog } from 'quasar';
import type {
  ExamData,
  Exam,
  Section,
  Answer,
  Question,
  Graphics,
  Code
} from '../components/models';

import { useStore } from '@/stores/store';
import { useApiStore } from '@/stores/api';
import * as Y from 'yjs';
import { defineStore } from 'pinia';
import { debounce } from 'lodash-es';
import sourceUpgrade from '@/utils/sourceUpgrade';

const AMCUI_COPY_KEY = 'AMCUI_COPY_KEY';

export const useExamStore = defineStore('exam', () => {
  const currentQuestion = ref<Question>();

  const copy = ref({
    enabled: false,
    data: {} as { [key: string]: Section },
    selected: new Set<string>()
  });

  const sectionIndex = ref<{ [key: string]: Section }>({});
  const questionIndex = ref<{ [key: string]: Question }>({});
  const answerIndex = ref<{ [key: string]: Answer }>({});
  const properties = ref<{ [key: string]: string }>({});
  const graphics = ref<{ [key: string]: Graphics }>({});
  const codes = ref<{ [key: string]: Code }>({});
  const source = ref('');
  let undoManager: Y.UndoManager;

  function observeDeepMap<T>(map: Y.Map<T>, index: Ref<{ [key: string]: T }>) {
    map.observeDeep((events: Y.YEvent<any>[]) => {
      events.forEach((event) => {
        event.changes.keys.forEach((change, key) => {
          if (change.action === 'add' || change.action === 'update') {
            // handle nested maps attribute update
            if (event.target._item) {
              (index.value[event.target._item.parentSub] as T)[key as keyof T] =
                event.target.get(key);
            } else {
              const data = event.target.get(key);
              if (data instanceof Y.Map) {
                // nested map was updated in full
                index.value[key] = Object.fromEntries(data.entries()) as T;
              } else {
                index.value[key] = data;
              }
            }
          } else if (change.action === 'delete') {
            delete index.value[key];
          }
        });
      });
    });
  }
  const store = useStore();
  const API = useApiStore();
  const router = useRouter();
  let ydoc: Y.Doc;

  const debouncedUpdateProperties = debounce(() => {
    getPropertiesFromLatexLayout().forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(exam.value.properties, key)) {
        updateProperty(key, '');
      }
    });
  }, 1000);

  function updateSource(source: string) {
    const ysource = ydoc.getText('source');
    ydoc.transact(() => {
      ysource.delete(0, ysource.length);
      ysource.insert(0, source);
      debouncedUpdateProperties();
    });
  }

  function updateProperty(key: string, value: string) {
    ydoc.getMap('properties').set(key, value);
  }

  function removeProperty(key: string) {
    ydoc.getMap('properties').delete(key);
  }

  function getPropertiesFromLatexLayout(): string[] {
    const source = ydoc.getText('source').toString();
    const re = /\\AMCUI([\w]+)/g;
    const matches = [];
    let match;
    while ((match = re.exec(source)) !== null) {
      matches.push(match[1]);
    }
    return matches;
  }

  function createSection(): Section {
    return {
      id: 's' + uuidv4(),
      title: 'Section Name',
      content: '<p></p>',
      level: 0,
      isNumbered: true,
      isSectionTitleVisibleOnAMC: true,
      shuffle: false,
      columns: 1,
      pageBreakBefore: false,
      questions: [],
      order: exam.value.sections.length
    };
  }

  function addSection(section: Section): number {
    ydoc.getMap('sections').set(section.id, new Y.Map(Object.entries(section)));
    return exam.value.sections.length;
  }

  function updateSection(section: Section, data: any) {
    ydoc.transact(() => {
      for (const key in data) {
        (ydoc.getMap('sections').get(section.id) as Y.Map<any>).set(key, data[key]);
      }
    });
  }

  function updateSectionsOrder(sections: Section[]) {
    ydoc.transact(() => {
      sections.forEach((section, index) => {
        if (section.order !== index) {
          (ydoc.getMap('sections').get(section.id) as Y.Map<any>).set('order', index);
        }
      });
    });
  }

  function removeSection(section: Section): number {
    let index = exam.value.sections.indexOf(section);
    ydoc.transact(() => {
      ydoc.getMap('sections').delete(section.id);
      section.questions.forEach(removeQuestion);
    });
    index--;
    if (index < 0) {
      index = 0;
    }
    if (exam.value.sections.length === 0) {
      addSection(createSection());
      index = 0;
    }
    return index;
  }

  function createQuestion(): Question {
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
      answers: []
    };
  }

  function saveQuestion(question: Question) {
    ydoc.getMap('questions').set(question.id, new Y.Map(Object.entries(question)));
  }

  function addQuestion(section: Section) {
    //copy type from previous question
    let previous;
    if (section.questions && section.questions.length > 0) {
      previous = section.questions[section.questions.length - 1];
    }

    const question = createQuestion();
    question.section = section.id;
    if (previous) {
      question.type = previous.type;
      question.columns = previous.columns;
    }
    if (question.type === 'OPEN') {
      question.answer = '';
    }
    question.order = section.questions.length;

    ydoc.transact(() => {
      saveQuestion(question);
      if (question.type !== 'OPEN') {
        addAnswer(question, 0);
        addAnswer(question, 1);
      }
    });
    return question;
  }

  function updateQuestion(question: Question, data: any) {
    ydoc.transact(() => {
      for (const key in data) {
        (ydoc.getMap('questions').get(question.id) as Y.Map<any>).set(key, data[key]);
      }
    });
  }

  function updateQuestionsOrder(section: Section, questions: Question[]) {
    ydoc.transact(() => {
      questions.forEach((question, index) => {
        if (question.order !== index) {
          (ydoc.getMap('questions').get(question.id) as Y.Map<any>).set('order', index);
        }
        if (question.section !== section.id) {
          (ydoc.getMap('questions').get(question.id) as Y.Map<any>).set('section', section.id);
        }
      });
    });
  }

  function copyQuestion(section: Section, question: Question) {
    const localcopy = createQuestion();
    localcopy.content = question.content;
    localcopy.type = question.type;
    localcopy.layout = question.layout;
    localcopy.ordered = question.ordered;
    localcopy.scoring = question.scoring;
    localcopy.points = question.points;
    localcopy.dots = question.dots;
    localcopy.lines = question.lines;
    localcopy.columns = question.columns;
    localcopy.boxedAnswers = question.boxedAnswers;
    localcopy.answer = question.answer;
    localcopy.section = section.id;
    localcopy.order = 1 + (question.order || 0);

    ydoc.transact(() => {
      section.questions.slice(localcopy.order).forEach((q) => {
        (ydoc.getMap('questions').get(q.id) as Y.Map<any>).set('order', 1 + (q.order || 0));
      });
      ydoc.getMap('questions').set(localcopy.id, new Y.Map(Object.entries(localcopy)));
      question.answers.forEach((answer) => {
        saveAnswer(copyAnswer(localcopy, answer));
      });
    });
  }

  function removeQuestion(question: Question) {
    ydoc.transact(() => {
      ydoc.getMap('questions').delete(question.id);
      question.answers.forEach(removeAnswer);
    });
  }

  function createAnswer(question: Question): Answer {
    return {
      id: 'a' + uuidv4(),
      content: '<p></p>',
      correct: false,
      question: question.id,
      order: Math.max(...question.answers.map((a) => a.order || 0)) + 1
    };
  }

  function addAnswer(question: Question, order?: number) {
    const answer = createAnswer(question);
    if (order !== undefined) {
      answer.order = order;
    }
    saveAnswer(answer);
  }

  function saveAnswer(answer: Answer) {
    ydoc.getMap('answers').set(answer.id, new Y.Map(Object.entries(answer)));
  }

  function updateAnswer(answer: Answer, data: any) {
    ydoc.transact(() => {
      for (const key in data) {
        (ydoc.getMap('answers').get(answer.id) as Y.Map<any>).set(key, data[key]);
      }
    });
  }

  function copyAnswer(question: Question, answer: Answer) {
    const copy = createAnswer(question);
    copy.content = answer.content;
    copy.correct = answer.correct;
    copy.order = answer.order;
    return copy;
  }

  function removeAnswer(answer: Answer) {
    ydoc.getMap('answers').delete(answer.id);
  }

  function createGraphics(): Graphics {
    return {
      id: 'g' + uuidv4(),
      border: false,
      width: 0.7,
      name: ''
    };
  }

  function addGraphics(graphics: Graphics) {
    ydoc.getMap('graphics').set(graphics.id, new Y.Map(Object.entries(graphics)));
  }

  function updateGraphics(graphic: Graphics, data: any) {
    ydoc.transact(() => {
      for (const key in data) {
        (ydoc.getMap('graphics').get(graphic.id) as Y.Map<any>).set(key, data[key]);
      }
    });
  }

  function deleteGraphics(graphics: Graphics) {
    if (graphics.name.endsWith('.excalidraw')) {
      graphics.name = graphics.name.replace('.excalidraw', '.pdf');
    }
    if (graphics.name.endsWith('.svg')) {
      graphics.name = graphics.name.replace('.svg', '.pdf');
    }
    API.deleteGraphics(graphics).catch(() => {});
    ydoc.getMap('graphics').delete(graphics.id);
  }

  function syncGraphics() {
    API.$http.get(API.URL + '/project/' + API.project + '/graphics/sync').then((r: any) => {
      const ids: string[] = [];
      r.data.forEach((filename: string) => {
        const id = filename.replace(/(.*)\..*?$/, '$1');
        ids.push(id);
        if (!exam.value.graphics.hasOwnProperty(id)) {
          const graphics = createGraphics();
          graphics.name = filename;
          graphics.id = id;
          addGraphics(graphics);
        }
      });
      for (const id in exam.value.graphics) {
        if (!ids.includes(id)) {
          deleteGraphics(exam.value.graphics[id]);
        }
      }
    });
  }

  function saveCode(code: Code) {
    ydoc.getMap('codes').set(code.id, new Y.Map(Object.entries(code)));
  }

  function updateCode(code: Code, data: any) {
    ydoc.transact(() => {
      for (const key in data) {
        (ydoc.getMap('codes').get(code.id) as Y.Map<any>).set(key, data[key]);
      }
    });
  }

  function addCode(id: string) {
    const code: Code = {
      id: id,
      border: true,
      mode: '',
      numbers: false,
      content: ''
    };
    saveCode(code);
    return code;
  }

  function getCode(id: string | null, create?: boolean) {
    if (id && exam.value.codes && exam.value.codes.hasOwnProperty(id)) {
      return exam.value.codes[id];
    } else {
      if (id && create) {
        return addCode(id);
      }
    }
    return undefined;
  }

  function removeCode(code: Code) {
    ydoc.getMap('codes').delete(code.id);
  }

  function graphicsPreviewURL(id: string) {
    return API.PROJECT_URL + '/static/src/graphics/' + id + '_thumb.jpg?token=' + store.token;
  }

  function getJSON() {
    return JSON.stringify(exam.value, null, 2);
  }

  function getGraphics(id: string | null) {
    if (id && exam.value.graphics && exam.value.graphics.hasOwnProperty(id)) {
      return exam.value.graphics[id];
    }
    return undefined;
  }

  function getGraphicsByName(name: string) {
    if (exam.value.graphics) {
      for (const key in exam.value.graphics) {
        if (exam.value.graphics[key].name === name) {
          return exam.value.graphics[key];
        }
      }
    }
    return undefined;
  }

  function importLatex(latex: string) {
    latexToExam(latex);
  }

  function toLatex(): ExamData {
    return examToLatex();
  }

  function toMoodleQuiz() {
    examToMoodle();
  }

  function toHtml() {
    examToHTML();
  }

  function linkToQuestion(section: Section, question?: Question) {
    const route: RouteLocationRaw = {
      name: 'Edit',
      params: {
        project: API.project,
        sectionIndex: exam.value.sections.indexOf(section)
      }
    };
    if (question) {
      route.hash = `#q${question.number}`;
    }
    return router.resolve(route);
  }

  function copyTo(name: string) {
    const localcopy = {
      src: API.project,
      dest: name,
      sections: copy.value.data,
      graphics: {},
      codes: {}
    };
    // TODO-nice: filter code and graphics to be copied #54
    localcopy.graphics = exam.value.graphics;
    localcopy.codes = exam.value.codes;
    localStorage.setItem(AMCUI_COPY_KEY, JSON.stringify(localcopy));
    if (name === API.project) {
      handleCopy();
    } else {
      router.push({ name: 'Edit', params: { project: name } });
    }
  }

  function toggleCopy(section: Section, question?: Question) {
    let sectionCopy, questionCopy;
    if (copy.value.data.hasOwnProperty(section.id)) {
      sectionCopy = copy.value.data[section.id];
      if (question) {
        //question handle
        questionCopy = sectionCopy.questions.find((q) => q.id === question.id);
        if (questionCopy) {
          //remove
          sectionCopy.questions.splice(sectionCopy.questions.indexOf(questionCopy), 1);
          copy.value.selected.delete(question.id);
        } else {
          //add
          sectionCopy.questions.splice(
            section.questions.indexOf(question),
            0,
            JSON.parse(JSON.stringify(question)) as Question
          );
          copy.value.selected.add(question.id);
        }
      } else {
        //remove section
        sectionCopy.questions.forEach((q) => {
          copy.value.selected.delete(q.id);
        });
        copy.value.selected.delete(section.id);
        delete copy.value.data[section.id];
      }
    } else {
      //add section copy
      sectionCopy = JSON.parse(JSON.stringify(section)) as Section;
      copy.value.data[section.id] = sectionCopy;
      copy.value.selected.add(sectionCopy.id);
      //add question
      if (question) {
        sectionCopy.questions = [];
        sectionCopy.questions.splice(
          section.questions.indexOf(question),
          0,
          JSON.parse(JSON.stringify(question)) as Question
        );
        copy.value.selected.add(question.id);
      } else {
        //add all
        sectionCopy.questions.forEach((q: Question) => {
          copy.value.selected.add(q.id);
        });
      }
    }
  }

  function handleCopy() {
    const copySrc = localStorage.getItem(AMCUI_COPY_KEY) as string;
    if (!copySrc) return;
    const localcopy = JSON.parse(copySrc) as {
      src: string;
      dest: string;
      sections: { [key: string]: Section };
      graphics: { [key: string]: Graphics };
      codes: { [key: string]: Code };
    };
    if (localcopy.dest !== API.project) return;
    Object.values(localcopy.sections).forEach((section: Section, index: number) => {
      const sectionCopy = createSection();
      sectionCopy.title = section.title;
      sectionCopy.content = section.content;
      sectionCopy.level = section.level;
      sectionCopy.isNumbered = section.isNumbered;
      sectionCopy.isSectionTitleVisibleOnAMC = section.isSectionTitleVisibleOnAMC;
      sectionCopy.shuffle = section.shuffle;
      sectionCopy.columns = section.columns;
      sectionCopy.pageBreakBefore = section.pageBreakBefore;
      sectionCopy.order = exam.value.sections.length + index;
      addSection(sectionCopy);
      section.questions.map((question: Question, qindex: number) => {
        question.order = qindex - 1;
        copyQuestion(sectionCopy, question);
      });
    });
    Object.values(localcopy.graphics).forEach((graphic: Graphics) => {
      addGraphics(graphic);
    });
    Object.values(localcopy.codes).forEach((code: Code) => {
      saveCode(code);
    });
    API.copyGraphics(localcopy.src as string, localcopy.dest as string);
    API.copyCodes(localcopy.src as string, localcopy.dest as string);

    localStorage.removeItem(AMCUI_COPY_KEY);
    copy.value.enabled = false;
    copy.value.selected.clear();
    copy.value.data = {};
    Notify.create({
      type: 'positive',
      message: 'Content has been copied!',
      position: 'top-right'
    });
  }

  function preview() {
    const data = toLatex();
    data.source = exam.value.source;
    data.codes = exam.value.codes;
    API.preview(data);
  }

  function print() {
    const print = () => {
      const data = toLatex();
      data.source = exam.value.source;
      data.codes = exam.value.codes;
      API.print(data);
    };

    if (API.options.status.scanned) {
      Dialog.create({
        title: 'Warning!',
        message:
          'Papers analysis was already made on the basis of the current working documents. If you modify working documents, you will not be capable any more of analyzing the papers you have already distributed!',
        cancel: true,
        ok: 'Print & Overwrite',
        color: 'negative',
        persistent: true,
        noEscDismiss: true,
        noBackdropDismiss: true
      }).onOk(() => {
        print();
      });
    } else {
      print();
    }
  }

  function importJSON(json: string | Exam) {
    console.time('importJSON');
    let newexam: Exam;
    if (typeof json === 'string') {
      newexam = JSON.parse(json) as Exam;
    } else {
      newexam = json;
    }
    ydoc.transact(() => {
      const yproperties = ydoc.getMap('properties');
      const ysections = ydoc.getMap('sections');
      const yquestions = ydoc.getMap('questions');
      const yanswers = ydoc.getMap('answers');
      const ygraphics = ydoc.getMap('graphics');
      const ycodes = ydoc.getMap('codes');

      for (const key of yproperties.keys()) {
        yproperties.delete(key);
      }
      for (const key in newexam.properties) {
        yproperties.set(key, newexam.properties[key]);
      }
      updateSource(newexam.source);

      for (const key of ysections.keys()) {
        ysections.delete(key);
      }
      for (const key of yquestions.keys()) {
        yquestions.delete(key);
      }
      for (const key of yanswers.keys()) {
        yanswers.delete(key);
      }
      for (const key of ygraphics.keys()) {
        ygraphics.delete(key);
      }
      for (const key of ycodes.keys()) {
        ycodes.delete(key);
      }
      Object.values(newexam.codes).forEach((code) => {
        ycodes.set(code.id, new Y.Map(Object.entries(code)));
      });
      Object.values(newexam.graphics).forEach((graphic) => {
        ygraphics.set(graphic.id, new Y.Map(Object.entries(graphic)));
      });
      // WARNING: we import as is without checking missing attributes or ids
      newexam.sections.forEach((section, sindex) => {
        const questions = section.questions;
        section.order = sindex;
        section.questions = [];
        delete section.number;
        const validSection = createSection();
        Object.assign(validSection, section);
        ysections.set(validSection.id, new Y.Map(Object.entries(validSection)));

        questions.forEach((question, qindex) => {
          const answers = question.answers;
          delete question.number;
          delete question.isValid;
          question.answers = [];
          question.section = section.id;
          question.order = qindex;
          const validQuestion = createQuestion();
          Object.assign(validQuestion, question);
          yquestions.set(question.id, new Y.Map(Object.entries(validQuestion)));

          answers.forEach((answer, aindex) => {
            answer.question = question.id;
            answer.order = aindex;
            yanswers.set(answer.id, new Y.Map(Object.entries(answer)));
          });
        });
      });
    });
    console.timeEnd('importJSON');
  }

  function loadTemplate(name: string) {
    API.loadTemplate(name).then((source) => {
      updateSource(source);
    });
  }

  function isIdInExamContent(id: string): boolean {
    if (source.value.includes(id)) {
      return true;
    }
    for (const section of Object.values(sectionIndex.value)) {
      if (section.content.includes(id)) {
        return true;
      }
    }
    for (const question of Object.values(questionIndex.value)) {
      if (question.content.includes(id) || (question.answer && question.answer.includes(id))) {
        return true;
      }
    }
    for (const answer of Object.values(answerIndex.value)) {
      if (answer.content.includes(id)) {
        return true;
      }
    }
    return false;
  }

  async function bindYdocToExam(newydoc: Y.Doc) {
    if (ydoc && ydoc === newydoc) return;
    console.time('bindYdocToExam');
    const log = API.newLog('loading exam');
    ydoc = newydoc;
    const ysections = ydoc.getMap('sections');
    const yquestions = ydoc.getMap('questions');
    const yanswers = ydoc.getMap('answers');
    const yproperties = ydoc.getMap('properties');
    const ysource = ydoc.getText('source');
    const ygraphics = ydoc.getMap('graphics');
    const ycodes = ydoc.getMap('codes');

    undoManager = new Y.UndoManager([
      ysections,
      yquestions,
      yanswers,
      yproperties,
      ysource,
      ygraphics,
      ycodes
    ]);

    observeDeepMap(ysections, sectionIndex);
    observeDeepMap(yquestions, questionIndex);
    observeDeepMap(yanswers, answerIndex);
    observeDeepMap(yproperties, properties);
    observeDeepMap(ygraphics, graphics);
    observeDeepMap(ycodes, codes);

    ysource.observe(() => {
      source.value = ysource.toString();
    });
    
    source.value = ysource.toString();
    if (source.value !== '') {
      const updatedSource = sourceUpgrade(source.value);
      if (source.value !== updatedSource) {
        updateSource(updatedSource);
      }
    }

    ysections.forEach((data) => {
      const section = Object.fromEntries((data as Y.Map<any>).entries()) as Section;
      sectionIndex.value[section.id] = section;
      // check structure
      if (typeof section.level === 'string') {
        updateSection(section, { level: parseInt(section.level, 10) });
      }
      if (typeof section.columns === 'string') {
        updateSection(section, { columns: parseInt(section.columns, 10) });
      }
    });
    yquestions.forEach((data) => {
      const question = Object.fromEntries((data as Y.Map<any>).entries()) as Question;
      questionIndex.value[question.id] = question;
      // check structure / upgrade old version
      if (typeof question.columns === 'string') {
        updateQuestion(question, { columns: parseInt(question.columns, 10) });
      }
      if (typeof question.lines === 'string') {
        updateQuestion(question, { lines: parseInt(question.lines, 10) });
      }
      if (!question.hasOwnProperty('lineup')) {
        updateQuestion(question, { lineup: false });
      }
      if (!question.hasOwnProperty('boxedAnswers')) {
        updateQuestion(question, { boxedAnswers: false });
      }
      if (question.type === 'OPEN' && !question.hasOwnProperty('answer')) {
        updateQuestion(question, { answer: '' });
      }
    });
    yanswers.forEach((data) => {
      const answer = Object.fromEntries((data as Y.Map<any>).entries()) as Answer;
      answerIndex.value[answer.id] = answer;
    });

    ygraphics.forEach((data) => {
      const graphic = Object.fromEntries((data as Y.Map<any>).entries()) as Graphics;
      graphic.updatedAt = new Date().getTime().toString();
      graphics.value[graphic.id] = graphic;
    });

    ycodes.forEach((data) => {
      const code = Object.fromEntries((data as Y.Map<any>).entries()) as Code;
      codes.value[code.id] = code;
      if (!isIdInExamContent(code.id)) {
        removeCode(code);
      }
    });

    properties.value = Object.fromEntries(yproperties.entries()) as { [key: string]: string };

    // check structure
    if (Object.keys(sectionIndex.value).length === 0) {
      // check if there is an data.json to import for duplicate or migration
      const json = await API.getDataJson();
      if (json) {
        importJSON(json);
      } else {
        addSection(createSection());
      }
    }
    log.end = new Date();
    log.progress = 1;
    console.timeEnd('bindYdocToExam');
  }

  function computeHierarchyNumbers(exam: Exam) {
    let questionCount = 1;
    const sections = [0, 0, 0];
    for (let s = 0; s < exam.sections.length; s++) {
      const section = exam.sections[s];
      if (section.isNumbered) {
        let label = '';
        for (let i = 0; i < 3; i++) {
          const level =
            typeof section.level === 'number' ? section.level : parseInt(section.level, 10);
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

  const exam = computed<Exam>(() => {
    console.time('exam');
    const localexam: Exam = {
      source: source.value,
      sections: Object.values(sectionIndex.value)
        .sort((a: Section, b: Section) => (a.order || 0) - (b.order || 0))
        .map((section: Section) => {
          return {
            ...section,
            questions: Object.values(questionIndex.value)
              .filter((question: Question) => question.section === section.id)
              .sort((a: Question, b: Question) => (a.order || 0) - (b.order || 0))
              .map((question: Question) => {
                return {
                  ...question,
                  answers: Object.values(answerIndex.value)
                    .filter((answer: Answer) => answer.question === question.id)
                    .sort((a: Answer, b: Answer) => (a.order || 0) - (b.order || 0))
                };
              })
          };
        }),
      properties: properties.value,
      codes: codes.value,
      graphics: graphics.value
    };
    computeHierarchyNumbers(localexam);
    console.timeEnd('exam');
    return localexam;
  });

  watchEffect(() => {
    if (!API.yjsSynced) {
      sectionIndex.value = {};
      questionIndex.value = {};
      answerIndex.value = {};
      properties.value = {};
      graphics.value = {};
      codes.value = {};
      source.value = '';
    }
    if (API.yjsSynced) {
      bindYdocToExam(API.getYdoc());
      handleCopy();
    }
  });

  return {
    undo() {
      if (undoManager) {
        undoManager.undo();
      }
    },
    redo() {
      if (undoManager) {
        undoManager.redo();
      }
    },
    currentQuestion,
    exam,
    copy,
    copyTo,
    toggleCopy,
    linkToQuestion,
    getCode,
    updateCode,
    updateSource,
    updateProperty,
    removeProperty,
    getPropertiesFromLatexLayout,
    addSection,
    createSection,
    updateSection,
    updateSectionsOrder,
    removeSection,
    addQuestion,
    saveQuestion,
    createQuestion,
    updateQuestion,
    updateQuestionsOrder,
    copyQuestion,
    removeQuestion,
    addAnswer,
    createAnswer,
    updateAnswer,
    removeAnswer,
    saveAnswer,
    preview,
    print,
    loadTemplate,
    toMoodleQuiz,
    syncGraphics,
    addGraphics,
    updateGraphics,
    deleteGraphics,
    getGraphicsByName,
    createGraphics,
    importLatex,
    importJSON,
    getJSON,
    toLatex,
    toHtml,
    graphicsPreviewURL,
    getGraphics,
    isIdInExamContent
  };
});
