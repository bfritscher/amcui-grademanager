import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { Quasar } from 'quasar';
import {
  ContentEditable,
  HistoryPlugin,
  LexicalComposer,
  RichTextPlugin,
  useLexicalComposer
} from 'lexical-vue';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  FORMAT_TEXT_COMMAND,
  UNDO_COMMAND,
  type LexicalEditor
} from 'lexical';
import ToolbarPlugin from '../../../src/components/Edit/lexical/plugins/ToolbarPlugin/index.vue';
import ImagePlugin from '../../../src/components/Edit/lexical/plugins/ImagePlugin.vue';
import {
  ImageNode,
  INSERT_IMAGE_COMMAND
} from '../../../src/components/Edit/lexical/nodes/ImageNode';

vi.mock('@/stores/exam', () => ({
  useExamStore: () => ({
    exam: { graphics: { test: { id: 'test', name: 'test.png' } } },
    graphicsPreviewURL: () => '/test.png?preview=1'
  })
}));

afterEach(() => {
  document.body.innerHTML = '';
});
// jsdom does not implement Range geometry used by Lexical's DOM selection.
beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});
afterAll(() => {
  Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
});

describe('Lexical toolbar integration', () => {
  it('updates selection formatting and renders inserted images without aborting editor updates', async () => {
    let editor!: LexicalEditor;
    const onError = vi.fn();
    const Bridge = defineComponent({
      setup() {
        editor = useLexicalComposer();
        return () =>
          h('div', [
            h(ToolbarPlugin),
            h(RichTextPlugin, null, { contentEditable: () => h(ContentEditable) }),
            h(ImagePlugin),
            h(HistoryPlugin)
          ]);
      }
    });
    const wrapper = mount(LexicalComposer, {
      props: { initialConfig: { namespace: 'toolbar-test', nodes: [ImageNode], onError } },
      slots: { default: () => h(Bridge) },
      global: { plugins: [Quasar] },
      attachTo: document.body
    });
    try {
      editor.update(
        () => {
          const text = $createTextNode('Image insertion');
          $getRoot().clear().append($createParagraphNode().append(text));
          text.select(0, text.getTextContentSize());
        },
        { discrete: true }
      );
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
      await flushPromises();
      expect(onError).not.toHaveBeenCalled();
      expect(wrapper.find('[contenteditable] strong').text()).toBe('Image insertion');

      editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
        id: 'test',
        name: 'test.png',
        width: 0.8,
        border: false
      });
      await flushPromises();
      await nextTick();
      expect(onError).not.toHaveBeenCalled();
      expect(wrapper.find('[data-lexical-decorator] img').exists()).toBe(true);

      editor.dispatchCommand(UNDO_COMMAND, undefined);
      await flushPromises();
      expect(onError).not.toHaveBeenCalled();
      expect(wrapper.find('[data-lexical-decorator] img').exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });
});
