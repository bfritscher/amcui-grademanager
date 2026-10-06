import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { Quasar } from 'quasar';
import { defineComponent, h, ref } from 'vue';
import { $getRoot, $getSelection, $isNodeSelection, getNearestEditorFromDOMNode } from 'lexical';
import { INSERT_TABLE_COMMAND } from '@lexical/table';
import LexicalEditor from '../../../src/components/Edit/lexical/LexicalEditor.vue';

vi.mock('@/stores/api', () => ({
  useApiStore: () => ({
    awarenessIndex: {},
    addAwarenessLocation: vi.fn(),
    removeAwarenessLocation: vi.fn()
  })
}));
vi.mock('@/stores/store', async () => {
  const { reactive } = await import('vue');
  return { useStore: () => reactive({ activeEditor: '', tableActionMenuOpen: false }) };
});
vi.mock('@/stores/exam', () => ({
  useExamStore: () => ({
    getGraphics: (id: string) => ({ id, name: `${id}.png`, width: 0.8, border: false }),
    getCode: vi.fn(),
    graphicsPreviewURL: (id: string) => `/${id}.png?preview=1`,
    exam: { graphics: { first: { name: 'first.png' }, second: { name: 'second.png' } } }
  })
}));

beforeEach(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});
afterEach(() => {
  Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  vi.restoreAllMocks();
});

describe('HTML editor initialization after reload', () => {
  it('sanitizes saved and remote HTML before previewing and importing into the editor', async () => {
    const unsafe =
      '<p>Safe <strong>formatting</strong></p><img id="first" src="x" onerror="window.pwned=1"><svg onload="window.pwned=1"></svg><iframe srcdoc="<script>alert(1)</script>"></iframe><script>alert(1)</script>';
    const wrapper = mount(LexicalEditor, {
      props: { modelValue: unsafe },
      attrs: { id: 'unsafe-saved-content' },
      global: { plugins: [Quasar] },
      attachTo: document.body
    });
    const check = () => {
      expect(wrapper.findAll('script, iframe, svg, [onerror], [onload], [srcdoc]')).toHaveLength(0);
      expect(wrapper.find('strong').text()).toBe('formatting');
    };
    try {
      await flushPromises();
      check();
      expect(wrapper.find('img').attributes('src')).toBe('/first.png?preview=1');
      await wrapper.setProps({ modelValue: unsafe.replace('Safe', 'Remote') });
      await flushPromises();
      check();
      await wrapper.find('.preview').trigger('click');
      await flushPromises();
      check();
      await wrapper.setProps({ modelValue: unsafe.replace('Safe', 'Live update') });
      await flushPromises();
      check();
    } finally {
      wrapper.unmount();
    }
  });

  it('keeps image selection and its toolbar working after moving image blocks', async () => {
    const html = ref(
      '<p><img id="first" alt="first.png"></p><p><img id="second" alt="second.png"></p>'
    );
    const Host = defineComponent({
      setup: () => () =>
        h(LexicalEditor, {
          id: 'image-move',
          modelValue: html.value,
          'onUpdate:modelValue': (value: string) => {
            html.value = value;
          }
        })
    });
    const wrapper = mount(Host, { global: { plugins: [Quasar] }, attachTo: document.body });
    try {
      await wrapper.find('.preview').trigger('click');
      await flushPromises();
      const root = wrapper.find('[contenteditable]');
      const editor = getNearestEditorFromDOMNode(root.element)!;
      editor.update(
        () => {
          const [first, second] = $getRoot().getChildren();
          second.insertAfter(first);
        },
        { discrete: true }
      );
      await flushPromises();
      for (const img of root.findAll('img')) {
        await img.trigger('click');
        await flushPromises();
        const selected = editor.read(() => {
          const selection = $getSelection();
          return $isNodeSelection(selection)
            ? selection.getNodes().map((node) => node.getKey())
            : [];
        });
        expect(selected).toHaveLength(1);
        expect(editor.getElementByKey(selected[0])?.contains(img.element)).toBe(true);
        expect(wrapper.text()).toContain('LaTeX Options');
      }
    } finally {
      wrapper.unmount();
    }
  });

  it.each([
    ['paragraph', '<p>Saved <strong>formatted</strong> text</p>', 'Saved formatted text'],
    ['list', '<ul><li>Saved item</li></ul>', 'Saved item'],
    ['code', '<pre data-language="js">const answer = 42;</pre>', 'const answer = 42;'],
    ['table', '<table><tbody><tr><td><p>Saved cell</p></td></tr></tbody></table>', 'Saved cell']
  ])('preserves %s content when entering edit mode', async (_name, html, text) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const wrapper = mount(LexicalEditor, {
      props: { modelValue: html },
      attrs: { id: 'reload-test' },
      global: { plugins: [Quasar] },
      attachTo: document.body
    });
    try {
      expect(wrapper.find('.preview').text()).toBe(text);
      await wrapper.find('.preview').trigger('click');
      await flushPromises();
      expect(wrapper.find('[contenteditable]').text()).toBe(text);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
    }
  });

  it('edits, exports, reloads, and replaces tables without duplicate observers', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let saved = '<table><tbody><tr><td><p>Saved cell</p></td></tr></tbody></table>';
    for (let reload = 0; reload < 2; reload++) {
      const wrapper = mount(LexicalEditor, {
        props: { modelValue: saved },
        attrs: { id: 'table-reload' },
        global: { plugins: [Quasar] },
        attachTo: document.body
      });
      try {
        await wrapper.find('.preview').trigger('click');
        await flushPromises();
        expect(wrapper.find('[contenteditable] td').text()).toBe(
          reload ? 'Edited cell' : 'Saved cell'
        );
        const editor = getNearestEditorFromDOMNode(wrapper.find('[contenteditable]').element)!;
        editor.update(
          () => {
            $getRoot().getAllTextNodes()[0].setTextContent('Edited cell');
          },
          { discrete: true }
        );
        await flushPromises();
        if (!reload) {
          const changes = wrapper.emitted('update:modelValue')!;
          saved = changes[changes.length - 1][0] as string;
        }
        expect(saved).toContain('Edited cell');
        expect(saved).toContain('<table');
        await wrapper.setProps({ modelValue: '<p>Replacement</p>' });
        await flushPromises();
        expect(wrapper.find('[contenteditable] table').exists()).toBe(false);
        await wrapper.setProps({ modelValue: saved });
        await flushPromises();
        expect(wrapper.find('[contenteditable] td').text()).toBe('Edited cell');

        await wrapper.setProps({ modelValue: '<p>Insert a table here</p>' });
        editor.update(
          () => {
            $getRoot().selectEnd();
          },
          { discrete: true }
        );
        editor.dispatchCommand(INSERT_TABLE_COMMAND, {
          rows: '2',
          columns: '2',
          includeHeaders: false
        });
        await flushPromises();
        expect(wrapper.findAll('[contenteditable] td')).toHaveLength(4);
        expect(errors).not.toHaveBeenCalled();
      } finally {
        wrapper.unmount();
      }
    }
  });
});
