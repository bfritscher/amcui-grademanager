import {
  createSection as newSection,
  createQuestion as newQuestion,
  createAnswer as newAnswer,
  patchEntity,
  putEntity,
  replaceExam,
  readExam,
  applyChanges,
  type CopyRequest
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

export const useExamStore = defineStore('exam', () => {
  const currentQuestion = ref<Question>();

  const copy = ref({
    enabled: false,
    busy: false,
    data: {} as Record<string, string[]>,
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

  const graphicsPreviewVersion = ref(0);

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
      // Sync may have regenerated a legacy thumbnail from its PNG original.
      graphicsPreviewVersion.value++;
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

  function graphicsPreviewURL(id: string) {
    return (
      API.PROJECT_URL +
      '/static/src/graphics/' +
      id +
      '_thumb.png?token=' +
      store.token +
      '&v=' +
      graphicsPreviewVersion.value
    );
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

  let pendingCopy: { fingerprint: string; request: CopyRequest } | undefined;
  function clearCopySelection() {
    copy.value.enabled = false;
    copy.value.selected.clear();
    copy.value.data = {};
    pendingCopy = undefined;
  }
  watch(() => API.project, clearCopySelection);

  async function copyTo(name: string) {
    if (copy.value.busy || !API.yjsSynced || !name || !Object.keys(copy.value.data).length) return;
    const source = API.project;
    const selection = Object.entries(copy.value.data).map(([sectionId, questionIds]) => ({
      sectionId,
      questionIds: [...questionIds]
    }));
    const fingerprint = JSON.stringify([source, name, selection]);
    if (pendingCopy?.fingerprint !== fingerprint) {
      pendingCopy = {
        fingerprint,
        request: {
          destinationProjectId: name,
          selection,
          requestId: uuidv4(),
          sourceSnapshot: Array.from(Y.encodeSnapshot(Y.snapshot(ydoc)))
        }
      };
    }
    copy.value.busy = true;
    try {
      await API.copyContent(source, pendingCopy.request);
      if (API.project === source) {
        clearCopySelection();
      }
      Notify.create({
        type: 'positive',
        message: 'Content has been copied!',
        position: 'top-right'
      });
      if (API.project === source && name !== source) {
        // Copy is already durable; a navigation failure must not invite another copy.
        await router
          .push({ name: 'Edit', params: { project: name, sectionIndex: '0' } })
          .catch(() => {
            Notify.create({
              type: 'warning',
              message: 'Content was copied, but the destination could not be opened.',
              position: 'top-right'
            });
          });
      }
    } catch (error) {
      // A rejected request made no changes. Refresh the source snapshot on retry;
      // keep the original receipt ID after ambiguous network/server failures.
      if ((error as { response?: { status?: number } }).response?.status === 409)
        pendingCopy = undefined;
      Notify.create({
        type: 'negative',
        message: 'Copy failed. Your selection is kept; please retry once the project is connected.',
        position: 'top-right'
      });
    } finally {
      copy.value.busy = false;
    }
  }

  function toggleCopy(section: Section, question?: Question) {
    if (copy.value.busy) return;
    const selected = copy.value.data[section.id];
    if (selected && !question) {
      selected.forEach((id) => copy.value.selected.delete(id));
      copy.value.selected.delete(section.id);
      delete copy.value.data[section.id];
    } else if (selected && question) {
      if (selected.includes(question.id)) {
        selected.splice(selected.indexOf(question.id), 1);
        copy.value.selected.delete(question.id);
      } else {
        selected.push(question.id);
        copy.value.selected.add(question.id);
      }
    } else {
      const ids = question ? [question.id] : section.questions.map((q) => q.id);
      copy.value.data[section.id] = ids;
      copy.value.selected.add(section.id);
      ids.forEach((id) => copy.value.selected.add(id));
    }
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
