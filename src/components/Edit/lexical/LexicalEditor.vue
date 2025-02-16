<script setup lang="ts">
import { ref, watch, nextTick, computed, useAttrs } from 'vue';
import { debounce } from 'lodash-es';
import {
  LexicalComposer,
  LexicalContentEditable,
  LexicalAutoFocusPlugin,
  LexicalHistoryPlugin,
  LexicalListPlugin,
  LexicalRichTextPlugin,
  LexicalTabIndentationPlugin,
  LexicalTablePlugin
} from 'lexical-vue';

import PlaygroundEditorTheme from './themes/EditorTheme';
import PlaygroundNodes from './nodes/PlaygroundNodes';

import TreeViewPlugin from './plugins/TreeViewPlugin.vue';
import ToolbarPlugin from './plugins/ToolbarPlugin/index.vue';
import CodeHighlightPlugin from './plugins/CodeHighlightPlugin.vue';
import ListMaxIndentLevelPlugin from './plugins/ListMaxIndentLevelPlugin.vue';
import DraggableBlockPlugin from './plugins/DraggableBlockPlugin.vue';
import LexicalHorizontalRulePlugin from './plugins/LexicalHorizontalRulePlugin.vue';
import PageBreakPlugin from './plugins/PageBreakPlugin.vue';
import TableActionMenuPlugin from './plugins/Table/TableActionMenuPlugin.vue';
import BoxPlugin from './plugins/BoxPlugin.vue';
import ImagePlugin from './plugins/ImagePlugin.vue';

import { $getRoot, $setSelection, $insertNodes } from 'lexical';

import type { LexicalEditor, CreateEditorArgs } from 'lexical';
import { $generateNodesFromDOM } from '@lexical/html';
import {
  WIDTH_DATA_ATTRIBUTE,
  OPTIONS_DATA_ATTRIBUTE,
  BORDER_DATA_ATTRIBUTE
} from './nodes/ImageNode';
import { NUMBERS_DATA_ATTRIBUTE, LANGUAGE_DATA_ATTRIBUTE } from './nodes/CustomCodeNode';
import BlurEventPlugin from './plugins/BlurEventPlugin.vue';
import { useExamStore } from '@/stores/exam';

import { EditorView, lineNumbers } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { sql } from '@codemirror/lang-sql';
import { html } from '@codemirror/lang-html';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { useApiStore } from '@/stores/api';
import { useStore } from '@/stores/store';

const props = defineProps({ modelValue: { type: String, required: true } });

const emit = defineEmits(['update:modelValue']);

const API = useApiStore();
const store = useStore();

const attrs = useAttrs();
const lockingUser = computed(() => {
  if (API.awarenessIndex[attrs.id as string] && API.awarenessIndex[attrs.id as string].length > 0) {
    return API.awarenessIndex[attrs.id as string][0];
  }
  return undefined;
});

const modeToLexical = {
  'text/html': 'html',
  'text/css': 'css',
  'text/javascript': 'js',
  'text/x-sql': 'sql',
  'text/x-java': 'java',
  'text/x-python': 'py',
  '': 'html'
} as { [key: string]: string };

function setFromHTML(editor: LexicalEditor) {
  const parser = new DOMParser();
  const dom = parser.parseFromString(props.modelValue, 'text/html');
  // legacy support center alignment without creating customParagraphNode
  dom.querySelectorAll('.wysiwyg-text-align-center').forEach((el) => {
    (el as HTMLElement).style.textAlign = 'center';
  });
  dom.querySelectorAll('tt').forEach((el) => {
    const code = document.createElement('code');
    code.innerHTML = el.innerHTML.trim();
    el.replaceWith(code);
  });
  dom.querySelectorAll('var').forEach((el) => {
    const code = document.createElement('mark');
    code.innerHTML = el.innerHTML;
    el.replaceWith(code);
  });
  // legacy image support
  dom.querySelectorAll('img').forEach((el) => {
    const img = el as HTMLImageElement;
    const imgData = examService.getGraphics(img.id);
    if (imgData) {
      if (!img.hasAttribute(WIDTH_DATA_ATTRIBUTE)) {
        img.setAttribute(WIDTH_DATA_ATTRIBUTE, `${Math.round(imgData.width * 100)}`);
      }
      if (!img.hasAttribute(BORDER_DATA_ATTRIBUTE)) {
        img.setAttribute(BORDER_DATA_ATTRIBUTE, imgData.border ? 'true' : 'false');
      }
      if (!img.hasAttribute(OPTIONS_DATA_ATTRIBUTE)) {
        img.setAttribute(OPTIONS_DATA_ATTRIBUTE, imgData.options || '');
      }
    }
  });
  // legacy code support
  dom.querySelectorAll('code').forEach((el) => {
    const code = el as HTMLElement;
    if (!code.id) return;
    const codeData = examService.getCode(code.id, false);
    if (codeData && code.children.length === 0) {
      const pre = document.createElement('pre');
      pre.innerHTML = `${codeData.content}`;
      pre.id = codeData.id;
      pre.setAttribute(BORDER_DATA_ATTRIBUTE, codeData.border ? 'true' : 'false');
      pre.setAttribute(NUMBERS_DATA_ATTRIBUTE, codeData.numbers ? 'true' : 'false');
      pre.setAttribute(LANGUAGE_DATA_ATTRIBUTE, modeToLexical[codeData.mode]);
      if (code.parentElement?.tagName === 'P' && code.parentElement.parentElement) {
        code.parentElement.parentElement.insertBefore(code, code.parentElement);
      }
      code.replaceWith(pre);
    }
  });
  setTimeout(() => {
    editor.update(() => {
      const nodes = $generateNodesFromDOM(editor, dom);
      $getRoot().clear().select();
      $insertNodes(nodes);
      $setSelection(null);
    });
  });
}

const preview = ref<HTMLElement | null>(null);

const showPreview = ref(true);

watch(
  () => lockingUser.value,
  () => {
    if (lockingUser.value) {
      showPreview.value = true;
    }
  }
);

const config: CreateEditorArgs = {
  theme: PlaygroundEditorTheme,
  nodes: [...PlaygroundNodes],
  editable: true,
  editorState: setFromHTML as any
};

function onError(error: Error) {
  console.error(error);
}

// decorate preview and update changes
const examService = useExamStore();

function decoratePreview() {
  if (!preview.value) {
    return;
  }
  const element = preview.value;
  const imgs = element.getElementsByTagName('img');
  for (let i = 0; i < imgs.length; i++) {
    const imgElement = imgs[i];
    const img = examService.getGraphics(imgElement.getAttribute('id'));
    if (img) {
      imgElement.setAttribute('src', examService.graphicsPreviewURL(img.id));

      imgElement.classList.toggle('border', img.border);
      imgElement.classList.toggle('options', !!img.options);

      // legacy support
      if (!imgElement.hasAttribute(WIDTH_DATA_ATTRIBUTE)) {
        imgElement.setAttribute(WIDTH_DATA_ATTRIBUTE, `${Math.round(img.width * 100)}`);
      }
      if (!imgElement.hasAttribute(BORDER_DATA_ATTRIBUTE)) {
        imgElement.setAttribute(BORDER_DATA_ATTRIBUTE, img.border ? 'true' : 'false');
      }
      if (!imgElement.hasAttribute(OPTIONS_DATA_ATTRIBUTE)) {
        imgElement.setAttribute(OPTIONS_DATA_ATTRIBUTE, img.options || '');
      }
      imgElement.style.width = imgElement.getAttribute(WIDTH_DATA_ATTRIBUTE) + '%';
      imgElement.classList.toggle(
        'border',
        imgElement.getAttribute(BORDER_DATA_ATTRIBUTE) === 'true'
      );
    } else {
      imgElement.setAttribute('src', examService.graphicsPreviewURL(''));
    }
  }

  const codes = element.getElementsByTagName('code');
  for (let c = 0; c < codes.length; c++) {
    const codeElement = codes[c];
    if (!codeElement.id || codeElement.hasAttribute(BORDER_DATA_ATTRIBUTE)) continue;
    codeElement.classList.add('wysihtml5-uneditable-container');
    const code = examService.getCode(codeElement.getAttribute('id'), true);
    if (code) {
      codeElement.classList.toggle('border', code.border);
      if (codeElement.children.length === 0) {
        const cm = new EditorView({ parent: codeElement });
        const extensions = [
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          EditorView.editable.of(false)
        ];
        if (code.mode === 'text/javascript') {
          extensions.push(javascript());
        } else if (code.mode === 'text/x-sql') {
          extensions.push(sql());
        } else if (code.mode === 'text/x-java') {
          extensions.push(java());
        } else if (code.mode === 'text/x-python') {
          extensions.push(python());
        } else if (code.mode === 'text/html') {
          extensions.push(html());
        } else if (code.mode === 'text/css') {
          extensions.push(css());
        }
        if (code.numbers) {
          extensions.push(lineNumbers());
        }
        const state = EditorState.create({ doc: code.content || '\n', extensions });
        cm.setState(state);
      }
    }
  }
}

watch(
  () => [preview.value, showPreview.value, props.modelValue],
  () => {
    if (showPreview.value && preview.value) {
      nextTick(decoratePreview);
    }
  },
  { immediate: true }
);

const editorContainer = ref<HTMLElement | null>(null);
const editorRef = ref<HTMLElement | null>(null);
const showDebug = ref(false);
const debugStarted = ref(false);
const hideToolbar = ref(false);
const toolbarActive = ref(false);
watch(showDebug, () => {
  if (showDebug.value && !debugStarted.value) {
    debugStarted.value = true;
  }
});

let contentChanged = debounce((html: string) => {
  emit('update:modelValue', html);
}, 1000);

function onFocus() {
  hideToolbar.value = false;
  if (store.activeEditor) {
    API.removeAwarenessLocation(store.activeEditor);
  }
  API.addAwarenessLocation(attrs.id as string);
  store.activeEditor = attrs.id as string;
}

function onBlur() {
  if (!showDebug.value && !toolbarActive.value && !store.tableActionMenuOpen) {
    hideToolbar.value = true;
    API.removeAwarenessLocation(attrs.id as string);
  }
}

function enable() {
  if (!lockingUser.value) {
    showPreview.value = false;
    hideToolbar.value = false;
  }
}

const oulinedClass = computed(() => {
  let classStr = 'editor-outlined ';
  classStr += lockingUser.value
    ? `outlined-active awareness-border-color-${API.getColorIndex(lockingUser.value.id)}`
    : '';
  classStr += !hideToolbar.value && store.activeEditor === attrs.id ? 'editor-active' : '';
  return classStr;
});
</script>

<template>
  <div :class="oulinedClass">
    <div
      v-if="lockingUser"
      class="user"
      :class="`awareness-color-${API.getColorIndex(lockingUser.id)}`"
    >
      {{ lockingUser.user?.username }}
    </div>
    <div class="lexical-editor">
      <!-- eslint-disable vue/no-v-html -->
      <div
        v-if="showPreview"
        ref="preview"
        class="preview"
        :class="{ empty: props.modelValue == '' || props.modelValue == '<p></p>' }"
        @click="enable()"
        v-html="props.modelValue"
      ></div>
      <!-- eslint-enable -->
      <LexicalComposer v-else :initial-config="config" @error="onError">
        <div class="editor-shell">
          <ToolbarPlugin
            v-if="!hideToolbar && store.activeEditor === attrs.id"
            v-model:debug="showDebug"
            v-model:active="toolbarActive"
          />
          <div ref="editorContainer" class="editor-container">
            <div className="editor-inner">
              <div v-if="debugStarted" v-show="showDebug">
                <TreeViewPlugin />
              </div>
              <div v-show="!showDebug">
                <LexicalRichTextPlugin>
                  <template #contentEditable>
                    <div class="editor-scroller">
                      <div ref="editorRef" class="editor">
                        <LexicalContentEditable class="ContentEditable__root" />
                      </div>
                    </div>
                  </template>
                  <template #placeholder>
                    <div class="editor-placeholder">Enter some text...</div>
                  </template>
                </LexicalRichTextPlugin>
              </div>
              <LexicalHistoryPlugin />
              <LexicalTabIndentationPlugin />
              <LexicalAutoFocusPlugin />
              <CodeHighlightPlugin />
              <LexicalListPlugin />
              <LexicalTablePlugin />
              <ListMaxIndentLevelPlugin :max-depth="3" />
              <DraggableBlockPlugin v-if="editorRef" :anchor-elem="editorRef" />
              <TableActionMenuPlugin v-if="editorRef" :anchor-elem="editorRef" />
              <LexicalHorizontalRulePlugin />
              <PageBreakPlugin />
              <BoxPlugin />
              <ImagePlugin />
              <BlurEventPlugin @change="contentChanged" @blur="onBlur" @focus="onFocus" />
              <!-- <LexicalCollaborationPlugin
        id="test"
        :provider-factory="providerFactory"
        :initial-editor-state="initialEditorState"
        :cursors-container-ref="editorContainer"
        cursor-color="#FF0000"
        username="Test"
        :should-bootstrap="true"
      /> -->
            </div>
          </div>
        </div>
      </LexicalComposer>
    </div>
  </div>
</template>
<style scoped>
.editor-active {
  min-width: 700px !important;
  z-index: 999;
}
.outlined-active .lexical-editor {
  filter: blur(3px);
  user-select: none;
  pointer-events: none;
}
.user {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}
.ContentEditable__root {
  border: 0;
  display: block;
  position: relative;
  outline: 0;
  padding: 8px 8px 8px 28px;
  min-height: 2em;
  font-family: 'Nimbus Sans L';
  font-size: 15px;
}
</style>
<style>
.lexical-editor {
  border: 1px solid #eee;
  line-height: 1.4;
}

.editor-outlined {
  border: 2px solid transparent;
  border-radius: 4px;
  position: relative;
  margin: 8px;
}

.editor-shell {
  margin: 0 auto;
  max-width: 1100px;
  color: #000;
  position: relative;
  font-weight: 400;
}

.text-red .editor-shell {
  color: inherit;
}

.editor-shell .editor-container {
  background: #fff;
  position: relative;
  display: block;
}

.editor-shell .editor-container.tree-view {
  border-radius: 0;
}

.editor-shell .editor-container.plain-text {
  border-top-left-radius: 10px;
  border-top-right-radius: 10px;
}

.editor-scroller {
  min-height: 2em;
  border: 0;
  display: flex;
  position: relative;
  outline: 0;
  z-index: 0;
  resize: vertical;
}

.editor-placeholder {
  color: #999;
  overflow: hidden;
  position: absolute;
  text-overflow: ellipsis;
  top: 8px;
  left: 28px;
  font-size: 15px;
  user-select: none;
  display: inline-block;
  pointer-events: none;
}

.editor {
  flex: auto;
  position: relative;
  resize: vertical;
  z-index: -1;
}

.editor-shell span.editor-image {
  cursor: default;
  display: inline-block;
  position: relative;
  user-select: none;
}

.editor-shell .editor-image img {
  width: 100%;
  cursor: default;
}

.editor-shell .editor-image img.focused {
  outline: 2px solid rgb(60, 132, 244);
  user-select: none;
}

.editor-shell .editor-image img.focused.draggable {
  cursor: grab;
}

.editor-shell .editor-image img.focused.draggable:active {
  cursor: grabbing;
}

.lexical-editor .preview {
  padding: 8px 8px 8px 28px;
  font-family: 'Nimbus Sans L';
  text-align: justify;
  font-size: 15px;
}

.editor-shell .editor-image img.border,
.lexical-editor .preview img.border {
  border: 1px solid #000;
  padding: 4px;
}

.editor-shell .editor-image img.options,
.lexical-editor .preview img.options {
  filter: blur(2px) grayscale(80%);
}

var, /* legacy support */
.lexical-editor mark,
.lexical-editor mark * {
  color: red;
  background-color: inherit;
  font-style: italic;
  font-family: 'Nimbus Mono';
  font-weight: bold;
}

.lexical-editor box {
  display: block;
  padding: 0 4px;
  border: 1px solid #000;
}
</style>
<style>
/* fix br missing on table insert */
.le__tableCell .le__paragraph {
  min-height: 21px;
}
</style>
