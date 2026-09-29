import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick, reactive } from 'vue';
import { QCheckbox, QSelect, QToggle, Quasar } from 'quasar';
import * as Y from 'yjs';
import {
  applyChanges,
  applyExamPaste,
  createSection,
  extractExamFragment,
  prepareExamPaste,
  putEntity,
  readExam,
  type CopyRequest
} from '@amcui/exam-core';
import { useExamStore } from '@/stores/exam';
import EditDrawer from '@/components/Edit/EditDrawer.vue';

const mocks = vi.hoisted(() => ({
  api: undefined as any,
  copyContent: vi.fn(),
  push: vi.fn(),
  notify: vi.fn()
}));
vi.mock('@/stores/api', () => ({ useApiStore: () => mocks.api }));
vi.mock('@/stores/store', () => ({
  useStore: () => ({ projects: [{ project: 'source' }, { project: 'destination' }], token: '' })
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { sectionIndex: '0' } }),
  useRouter: () => ({ push: mocks.push, resolve: () => ({ href: '#' }) })
}));
vi.mock('quasar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('quasar')>()),
  Notify: { create: mocks.notify }
}));

let source: Y.Doc, destination: Y.Doc, current: Y.Doc;
let pinia: ReturnType<typeof createPinia>;
let wrapper: ReturnType<typeof mount> | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  source = new Y.Doc();
  destination = new Y.Doc();
  current = source;
  const section = createSection();
  section.title = 'Selected section';
  putEntity(source, 'sections', section);
  putEntity(destination, 'sections', createSection());
  applyChanges(source, [
    { op: 'question.create', sectionId: section.id, fields: { content: '<p>First</p>' } },
    {
      op: 'question.create',
      sectionId: section.id,
      fields: { type: 'OPEN', content: '<p>Second</p>', answer: '<p>Solution</p>' }
    }
  ]);
  mocks.api = reactive({
    project: 'source',
    yjsSynced: true,
    getYdoc: () => current,
    newLog: () => ({}),
    getProjectList: vi.fn(),
    copyContent: mocks.copyContent
  });
  mocks.push.mockResolvedValue(undefined);
  mocks.copyContent.mockImplementation(async (_source: string, request: CopyRequest) => {
    const target = request.destinationProjectId === 'source' ? source : destination;
    applyExamPaste(
      target,
      prepareExamPaste(extractExamFragment(readExam(source), request.selection))
    );
  });
  pinia = createPinia();
  setActivePinia(pinia);
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  pinia._s.forEach((store) => store.$dispose());
  source.destroy();
  destination.destroy();
  localStorage.clear();
});

async function drawer() {
  wrapper = mount(EditDrawer, {
    global: {
      plugins: [pinia, Quasar],
      stubs: { RouterLink: { template: '<a><slot /></a>' }, AwarenessIndicator: true }
    }
  });
  await wrapper.findComponent(QToggle).trigger('click');
  await flushPromises();
  return wrapper;
}
function copyButton() {
  return wrapper!.findAll('button').find((button) => button.text() === 'Copy')!;
}

describe('Activate copy / CopyTo', () => {
  it('selects a section in the drawer and copies to another project before navigation, with no reload replay', async () => {
    const page = await drawer();
    const store = useExamStore();
    expect(copyButton().attributes('disabled')).toBeDefined();
    await page.findAllComponents(QCheckbox)[0].trigger('click');
    expect(page.text()).toContain('2 question(s) in 1 section(s).');
    page.findComponent(QSelect).vm.$emit('update:modelValue', 'destination');
    await nextTick();
    // Content changed after selection must be copied from the current source.
    applyChanges(source, [
      {
        op: 'question.update',
        id: store.exam.sections[0].questions[0].id,
        fields: { content: '<p>Edited first</p>' }
      }
    ]);
    let finish!: () => void;
    const serverCopy = mocks.copyContent.getMockImplementation()!;
    mocks.copyContent.mockImplementationOnce(
      (...args) =>
        new Promise<void>((resolve) => {
          finish = async () => {
            await serverCopy(...args);
            resolve();
          };
        })
    );
    await copyButton().trigger('click');
    expect(store.copy.busy).toBe(true);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
    await store.copyTo('destination');
    expect(mocks.copyContent).toHaveBeenCalledTimes(1);
    finish();
    await flushPromises();
    const request = mocks.copyContent.mock.calls[0][1];
    expect(request).toMatchObject({
      destinationProjectId: 'destination',
      selection: [
        {
          sectionId: readExam(source).sections[0].id,
          questionIds: readExam(source).sections[0].questions.map((q) => q.id)
        }
      ]
    });
    expect(request.sourceSnapshot.length).toBeGreaterThan(0);
    const copied = readExam(destination).sections[1];
    expect(copied.questions.map((q) => q.content)).toEqual([
      '<p>Edited first</p>',
      '<p>Second</p>'
    ]);
    expect(copied.questions[1].answer).toBe('<p>Solution</p>');
    expect(mocks.push).toHaveBeenCalledWith({
      name: 'Edit',
      params: { project: 'destination', sectionIndex: '0' }
    });
    expect(store.copy.selected.size).toBe(0);
    expect(store.copy.enabled).toBe(false);
    expect(store.copy.busy).toBe(false);
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'positive' }));
    expect(localStorage.getItem('AMCUI_COPY_KEY')).toBeNull();
    mocks.api.yjsSynced = false;
    await nextTick();
    current = destination;
    mocks.api.project = 'destination';
    mocks.api.yjsSynced = true;
    await nextTick();
    expect(store.exam.sections).toHaveLength(2);
    expect(mocks.copyContent).toHaveBeenCalledTimes(1);
  });

  it('selects individual questions and copies within the current project without reversing order', async () => {
    const page = await drawer();
    // Deliberately select in reverse order.
    await page.findAllComponents(QCheckbox)[2].trigger('click');
    await page.findAllComponents(QCheckbox)[1].trigger('click');
    expect(page.text()).toContain('2 question(s) in 1 section(s).');
    page.findComponent(QSelect).vm.$emit('update:modelValue', 'source');
    await nextTick();
    await copyButton().trigger('click');
    await flushPromises();
    expect(readExam(source).sections[1].questions.map((q) => q.content)).toEqual([
      '<p>First</p>',
      '<p>Second</p>'
    ]);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.copyContent).toHaveBeenCalledTimes(1);
  });

  it('keeps a partial selection on failure and reuses the request ID on retry', async () => {
    const page = await drawer();
    await page.findAllComponents(QCheckbox)[2].trigger('click');
    expect(page.text()).toContain('1 question(s) in 1 section(s).');
    page.findComponent(QSelect).vm.$emit('update:modelValue', 'destination');
    await nextTick();
    mocks.copyContent.mockRejectedValueOnce(new Error('network failure'));
    await copyButton().trigger('click');
    await flushPromises();
    const store = useExamStore();
    expect(store.copy.enabled).toBe(true);
    expect(store.copy.busy).toBe(false);
    expect(page.text()).toContain('1 question(s) in 1 section(s).');
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'negative' }));
    await copyButton().trigger('click');
    await flushPromises();
    expect(mocks.copyContent.mock.calls[1][1]).toEqual(mocks.copyContent.mock.calls[0][1]);
    expect(readExam(destination).sections[1].questions.map((q) => q.content)).toEqual([
      '<p>Second</p>'
    ]);
  });

  it('clears the selection on project changes and ignores a stale legacy clipboard', async () => {
    const store = useExamStore();
    store.toggleCopy(store.exam.sections[0]);
    localStorage.setItem('AMCUI_COPY_KEY', '{"dest":"destination","sections":{}}');
    mocks.api.yjsSynced = false;
    await nextTick();
    current = destination;
    mocks.api.project = 'destination';
    mocks.api.yjsSynced = true;
    await nextTick();
    expect(store.copy.selected.size).toBe(0);
    expect(store.exam.sections).toHaveLength(1);
    expect(mocks.copyContent).not.toHaveBeenCalled();
  });
});
