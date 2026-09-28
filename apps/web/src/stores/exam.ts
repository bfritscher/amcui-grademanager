import {
  createSection as newSection,
  createQuestion as newQuestion,
  createAnswer as newAnswer,
  patchEntity,
  putEntity,
  replaceExam,
  readExam,
  applyChanges
} from '@amcui/exam-core';
import { computed, ref, watch, type Ref } from 'vue';
import { type RouteLocationRaw, useRouter } from 'vue-router';
import { v4 as uuidv4 } from 'uuid';
import latexToExam from '../services/latexToExam';
import examToLatex from '../services/examToLatex';
import examToMoodle from '../services/examToMoodle';
import examToImportText from '../services/examToImportText';
import examToHTML from '../services/examToHTML';
import { Notify, Dialog } from 'quasar';
import type {
  ExamData,
  Exam,
  Section,
  Answer,
  Question,
  Graphics,
  Code,
  PartialQuestion
} from '../components/models';

import { useStore } from '@/stores/store';
import { useApiStore } from '@/stores/api';
import * as Y from 'yjs';
import { defineStore } from 'pinia';
import { debounce } from 'lodash-es';

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
  const revision = ref(0);
  let undoManager: Y.UndoManager;
  let stopObserving: (() => void)[] = [];

  function observeDeepMap<T>(map: Y.Map<T>, index: Ref<{ [key: string]: T }>) {
    const observe = (events: Y.YEvent<any>[]) => {
      const keys = new Set(
        events.flatMap((event) =>
          event.path.length ? [String(event.path[0])] : [...event.changes.keys.keys()]
        )
      );
      for (const key of keys) {
        const value = map.get(key);
        if (value === undefined) delete index.value[key];
        else index.value[key] = (value instanceof Y.Map ? value.toJSON() : value) as T;
      }
    };
    map.observeDeep(observe);
    stopObserving.push(() => map.unobserveDeep(observe));
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
    return newSection(exam.value.sections.length);
  }

  function addSection(section: Section): number {
    putEntity(ydoc, 'sections', section);
    return exam.value.sections.length;
  }

  function updateSection(section: Section, data: any) {
    patchEntity(ydoc, 'sections', section.id, data);
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
    applyChanges(ydoc, [{ op: 'section.delete', id: section.id }]);
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
    return newQuestion();
  }

  function saveQuestion(question: Question) {
    putEntity(ydoc, 'questions', question);
  }

  function addQuestion(section: Section) {
    //copy type from previous question
    let previous;
    if (section.questions && section.questions.length > 0) {
      previous = section.questions[section.questions.length - 1];
    }

    const result = applyChanges(ydoc, [
      {
        op: 'question.create',
        sectionId: section.id,
        fields: previous ? { type: previous.type, columns: previous.columns } : {}
      }
    ]);
    return result.exam.sections
      .flatMap((s) => s.questions)
      .find((q) => q.id === result.affectedIds[0])!;
  }

  function updateQuestion(question: Question, data: any) {
    patchEntity(ydoc, 'questions', question.id, data);
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
    applyChanges(ydoc, [{ op: 'question.duplicate', id: question.id, sectionId: section.id }]);
  }

  function importPartialQuestions(section: Section, questions: PartialQuestion[]) {
    const fields = [
      'content',
      'type',
      'layout',
      'ordered',
      'scoring',
      'points',
      'dots',
      'lines',
      'columns',
      'lineup',
      'boxedAnswers',
      'answer'
    ];
    applyChanges(
      ydoc,
      questions.map((q) => ({
        op: 'question.create',
        sectionId: section.id,
        fields: Object.fromEntries(Object.entries(q).filter(([key]) => fields.includes(key))),
        answers: q.answers?.map((a) => ({
          content: a.content || '',
          correct: a.correct || false,
          ...(a.scoring === undefined ? {} : { scoring: String(a.scoring) })
        }))
      }))
    );
  }

  function removeQuestion(question: Question) {
    applyChanges(ydoc, [{ op: 'question.delete', id: question.id }]);
  }

  function createAnswer(question: Question): Answer {
    return newAnswer(question);
  }

  function addAnswer(question: Question, order?: number) {
    const answer = createAnswer(question);
    if (order !== undefined) {
      answer.order = order;
    }
    saveAnswer(answer);
  }

  function saveAnswer(answer: Answer) {
    putEntity(ydoc, 'answers', answer);
  }

  function updateAnswer(answer: Answer, data: any) {
    patchEntity(ydoc, 'answers', answer.id, data);
  }

  function copyAnswer(question: Question, answer: Answer) {
    const copy = createAnswer(question);
    copy.content = answer.content;
    copy.correct = answer.correct;
    copy.order = answer.order;
    copy.scoring = answer.scoring;
    return copy;
  }

  function removeAnswer(answer: Answer) {
    applyChanges(ydoc, [{ op: 'answer.delete', id: answer.id }]);
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

  function toImportText() {
    const { exportedQuestions, exportedOpenQuestions } = examToImportText();
    Notify.create({
      type: 'positive',
      message:
        exportedOpenQuestions > 0
          ? `Exported ${exportedQuestions} question(s), including ${exportedOpenQuestions} open question(s).`
          : `Exported ${exportedQuestions} question(s) in text format.`
    });
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
    // codes includes inline code materialized by the shared renderer.
    API.preview(data);
  }

  function print() {
    const print = () => {
      const data = toLatex();
      data.source = exam.value.source;
      // codes includes inline code materialized by the shared renderer.
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
    replaceExam(ydoc, json);
  }

  function loadTemplate(name: string) {
    API.loadTemplate(name).then((source: string) => {
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
    console.time('bindYdocToExam');
    const log = API.newLog('loading exam');
    stopObserving.forEach((stop) => stop());
    stopObserving = [];
    undoManager?.destroy();
    ydoc = newydoc;
    const changed = () => {
      revision.value++;
    };
    newydoc.on('afterTransaction', changed);
    stopObserving.push(() => newydoc.off('afterTransaction', changed));
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

    const sourceChanged = () => {
      source.value = ysource.toString();
    };
    ysource.observe(sourceChanged);
    stopObserving.push(() => ysource.unobserve(sourceChanged));

    source.value = ysource.toString();

    ysections.forEach((data) => {
      const section = Object.fromEntries((data as Y.Map<any>).entries()) as Section;
      sectionIndex.value[section.id] = section;
    });
    yquestions.forEach((data) => {
      const question = Object.fromEntries((data as Y.Map<any>).entries()) as Question;
      questionIndex.value[question.id] = question;
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
    });

    properties.value = Object.fromEntries(yproperties.entries()) as { [key: string]: string };

    log.end = new Date();
    log.progress = 1;
    console.timeEnd('bindYdocToExam');
  }

  const exam = computed<Exam>(() => {
    void revision.value;
    return ydoc && API.yjsSynced
      ? readExam(ydoc)
      : { sections: [], properties: {}, graphics: {}, codes: {}, source: '' };
  });

  watch(
    () => API.yjsSynced,
    () => {
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
    },
    { immediate: true }
  );

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
    importPartialQuestions,
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
    toImportText,
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
