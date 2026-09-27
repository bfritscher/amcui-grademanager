<template>
  <div ref="dom" class="codemirror-container"></div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, watch, type PropType } from 'vue';
import {
  keymap,
  highlightSpecialChars,
  drawSelection,
  highlightActiveLine,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  lineNumbers,
  highlightActiveLineGutter,
  EditorView
} from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import {
  defaultHighlightStyle,
  syntaxHighlighting,
  indentOnInput,
  bracketMatching,
  foldGutter,
  foldKeymap
} from '@codemirror/language';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap
} from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';
import { StreamLanguage, codeFolding } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { css } from '@codemirror/lang-css';
import { sql } from '@codemirror/lang-sql';
import { html } from '@codemirror/lang-html';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';

export default defineComponent({
  props: {
    modelValue: {
      type: String as PropType<string>,
      required: true
    },
    options: {
      type: Object as PropType<any>,
      required: false,
      default() {
        return {};
      }
    }
  },
  emits: ['update:modelValue'],
  setup(props: { modelValue: string; options: any }, { emit }) {
    const dom = ref(null);
    const content = ref<string>(props.modelValue || '');
    let editorView: EditorView | null = null;

    watch(
      () => props.options,
      (newOptions) => {
        if (editorView) {
          const state = EditorState.create({
            doc: content.value,
            extensions: extensionsFromOptions(newOptions)
          });
          editorView.setState(state);
        }
      },
      { deep: true }
    );

    watch(
      () => props.modelValue,
      (newValue) => {
        if (editorView && content.value !== newValue) {
          const transaction = editorView.state.update({
            changes: { from: 0, to: editorView.state.doc.length, insert: newValue }
          });
          editorView.dispatch(transaction);
        }
      }
    );

    onMounted(() => {
      if (!dom.value) return;
      const startState = EditorState.create({
        doc: content.value,
        extensions: extensionsFromOptions(props.options)
      });
      editorView = new EditorView({
        state: startState,
        parent: dom.value
      });
    });

    function extensionsFromOptions(options: any) {
      const extensions = [
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          ...lintKeymap
        ]),
        codeFolding(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const value = editorView!.state.doc.toString();
            if (value !== content.value) {
              content.value = value;
              emit('update:modelValue', value);
            }
          }
        })
      ];

      if (options.lineNumbers) {
        extensions.push(lineNumbers());
      }

      if (options.lineWrapping !== undefined) {
        extensions.push(EditorView.lineWrapping);
      }

      if (options.readOnly) {
        extensions.push(EditorView.editable.of(false));
      } else {
        extensions.push(history());
      }

      // Set the mode based on the 'mode' option passed
      if (options.mode === 'application/json') {
        extensions.push(json());
      } else if (options.mode === 'stex') {
        extensions.push(StreamLanguage.define(stex));
      } else if (options.mode === 'text/javascript') {
        extensions.push(javascript());
      } else if (options.mode === 'text/x-sql') {
        extensions.push(sql());
      } else if (options.mode === 'text/x-java') {
        extensions.push(java());
      } else if (options.mode === 'text/x-python') {
        extensions.push(python());
      } else if (options.mode === 'text/html') {
        extensions.push(html());
      } else if (options.mode === 'text/css') {
        extensions.push(css());
      }

      return extensions;
    }

    return {
      dom
    };
  }
});
</script>

<style>
.codemirror-container .cm-editor {
  height: auto;
}
</style>
