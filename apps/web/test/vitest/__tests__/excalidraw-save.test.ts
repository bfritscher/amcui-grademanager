import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { Quasar } from 'quasar';
import ExcalidrawDialog from '../../../src/components/Edit/ExcalidrawDialog.vue';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  add: vi.fn(),
  update: vi.fn(),
  ok: vi.fn(),
  notify: vi.fn(),
  load: vi.fn(),
  promptOk: undefined as undefined | ((name: string) => Promise<void>),
  graphic: { id: 'drawing-test', name: '', width: 0.7, border: false }
}));
vi.mock('@/stores/api', () => ({
  useApiStore: () => ({ uploadGraphics: mocks.upload, getStaticFileContent: mocks.load })
}));
vi.mock('@/stores/exam', () => ({
  useExamStore: () => ({
    createGraphics: () => ({ ...mocks.graphic }),
    addGraphics: mocks.add,
    updateGraphics: mocks.update
  })
}));
vi.mock('quasar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('quasar')>();
  const { ref } = await import('vue');
  return {
    ...actual,
    useQuasar: () => ({
      notify: mocks.notify,
      dialog: () => ({
        onOk: (callback: typeof mocks.promptOk) => {
          mocks.promptOk = callback;
        }
      })
    }),
    useDialogPluginComponent: Object.assign(
      () => ({
        dialogRef: ref(),
        onDialogHide: vi.fn(),
        onDialogOK: mocks.ok
      }),
      { emits: ['ok', 'hide'] }
    )
  };
});
vi.mock('react-dom/client', () => ({
  createRoot: () => ({
    render: (element: { props: { excalidrawAPI: (api: unknown) => void } }) => {
      element.props.excalidrawAPI({
        getSceneElements: () => [],
        getAppState: () => ({}),
        getFiles: () => ({})
      });
    },
    unmount: vi.fn()
  })
}));
vi.mock('@excalidraw/excalidraw', () => ({
  Excalidraw: () => null,
  serializeAsJSON: () => '{"type":"excalidraw"}',
  exportToSvg: async () => document.createElementNS('http://www.w3.org/2000/svg', 'svg')
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.promptOk = undefined;
  mocks.upload.mockResolvedValue(undefined);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function mountDrawing(graphic?: typeof mocks.graphic) {
  const wrapper = mount(ExcalidrawDialog, {
    props: { graphic },
    global: { plugins: [Quasar], stubs: { QDialog: { template: '<div><slot /></div>' } } }
  });
  await vi.dynamicImportSettled();
  await flushPromises();
  await vi.advanceTimersByTimeAsync(300);
  await flushPromises();
  return wrapper;
}

describe('Excalidraw Save As', () => {
  it('uploads before publishing a new graphic and closes with the saved graphic', async () => {
    const wrapper = await mountDrawing();
    try {
      await wrapper
        .findAll('button')
        .find((button) => button.text() === 'save as')!
        .trigger('click');
      await mocks.promptOk!(' Diagram ');
      const graphic = { ...mocks.graphic, name: 'Diagram.excalidraw' };
      expect(mocks.upload).toHaveBeenCalledWith(graphic, expect.any(File), '{"type":"excalidraw"}');
      expect(mocks.add).toHaveBeenCalledWith(graphic);
      expect(mocks.upload.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.add.mock.invocationCallOrder[0]
      );
      expect(mocks.ok).toHaveBeenCalledWith(graphic);
      expect(wrapper.vm.isSaving).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  it('keeps the drawing open after upload failure, reports it, and allows retry without orphan graphics', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.upload.mockRejectedValueOnce(new Error('Conversion failed'));
    const wrapper = await mountDrawing();
    try {
      await wrapper
        .findAll('button')
        .find((button) => button.text() === 'save as')!
        .trigger('click');
      await mocks.promptOk!('Diagram');
      expect(mocks.ok).not.toHaveBeenCalled();
      expect(mocks.add).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'negative' }));
      expect(wrapper.vm.isSaving).toBe(false);
      await wrapper
        .findAll('button')
        .find((button) => button.text() === 'save as')!
        .trigger('click');
      await mocks.promptOk!('Diagram');
      expect(mocks.upload).toHaveBeenCalledTimes(2);
      expect(mocks.add).toHaveBeenCalledTimes(1);
      expect(mocks.ok).toHaveBeenCalledTimes(1);
    } finally {
      wrapper.unmount();
    }
  });

  it('saves an existing drawing without creating a second graphic and prevents duplicate submissions', async () => {
    const graphic = { ...mocks.graphic, name: 'Existing.excalidraw' };
    let finishUpload!: () => void;
    mocks.upload.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishUpload = resolve;
        })
    );
    const wrapper = await mountDrawing(graphic);
    try {
      expect(mocks.load).toHaveBeenCalledWith(`src/graphics/${graphic.id}.excalidraw`);
      const save = wrapper.findAll('button').find((button) => button.text() === 'save')!;
      await save.trigger('click');
      await flushPromises();
      expect(save.attributes('disabled')).toBeDefined();
      expect(
        wrapper
          .findAll('button')
          .find((button) => button.text() === 'save as')!
          .attributes('disabled')
      ).toBeDefined();
      expect(mocks.ok).not.toHaveBeenCalled();
      await save.trigger('click');
      expect(mocks.upload).toHaveBeenCalledTimes(1);
      finishUpload();
      await flushPromises();
      expect(mocks.add).not.toHaveBeenCalled();
      expect(mocks.update).toHaveBeenCalledWith(graphic, { updatedAt: expect.any(String) });
      expect(mocks.ok).toHaveBeenCalledWith(graphic);
    } finally {
      wrapper.unmount();
    }
  });
});
