import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick, onMounted, ref } from 'vue';
import { LexicalComposer, useLexicalComposer } from 'lexical-vue';
import { $getRoot, $createParagraphNode, $createTextNode, type LexicalEditor } from 'lexical';
import RemoteContentPlugin from '../../../src/components/Edit/lexical/plugins/RemoteContentPlugin.vue';
import BlurEventPlugin from '../../../src/components/Edit/lexical/plugins/BlurEventPlugin.vue';

describe('mounted rich-text synchronization', () => {
  it('loads remote content without echoing it, and continues publishing local edits', async () => {
    let editor: LexicalEditor;
    const emitted: string[] = [];
    const html = ref('Initial');
    const revision = ref('initial-assets');
    let loads = 0;
    const load = (target: LexicalEditor) =>
      target.update(
        () => {
          loads++;
          $getRoot()
            .clear()
            .append($createParagraphNode().append($createTextNode(html.value)));
        },
        { tag: 'amcui-remote', discrete: true }
      );
    const Bridge = defineComponent({
      setup() {
        editor = useLexicalComposer();
        const root = ref<HTMLElement>();
        onMounted(() => {
          editor.setRootElement(root.value!);
          load(editor);
        });
        return () =>
          h('div', [
            h('div', { ref: root, contenteditable: true }),
            h(RemoteContentPlugin, { html: html.value, revision: revision.value, load }),
            h(BlurEventPlugin, { onChange: (value: string) => emitted.push(value) })
          ]);
      }
    });
    const Wrapper = defineComponent({
      setup: () => () =>
        h(
          LexicalComposer,
          {
            initialConfig: {
              namespace: 'remote-test',
              onError: (error: Error) => {
                throw error;
              }
            }
          },
          { default: () => h(Bridge) }
        )
    });
    const wrapper = mount(Wrapper, { attachTo: document.body });
    await nextTick();
    emitted.length = 0;
    html.value = 'MCP changed this';
    await nextTick();
    await nextTick();
    expect(editor!.getEditorState().read(() => $getRoot().getTextContent())).toBe(
      'MCP changed this'
    );
    expect(emitted).toEqual([]);
    const previousLoads = loads;
    revision.value = 'remote-legacy-code-update';
    await nextTick();
    await nextTick();
    expect(loads).toBe(previousLoads + 1);
    expect(emitted).toEqual([]);
    editor!.update(
      () => {
        $getRoot()
          .clear()
          .append($createParagraphNode().append($createTextNode('Teacher continued')));
      },
      { discrete: true }
    );
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toContain('Teacher continued');
    wrapper.unmount();
  });
});
