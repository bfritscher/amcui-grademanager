<script setup lang="ts">
import { watch } from 'vue';
import { useLexicalComposer } from 'lexical-vue';
import { $generateHtmlFromNodes } from '@lexical/html';
import type { LexicalEditor } from 'lexical';

const props = defineProps<{
  html: string;
  revision?: string;
  load: (editor: LexicalEditor) => void;
}>();
const editor = useLexicalComposer();
watch(
  () => [props.html, props.revision] as const,
  ([value, revision], previous) => {
    const current = editor.getEditorState().read(() => $generateHtmlFromNodes(editor, null));
    if (current !== value || revision !== previous?.[1]) props.load(editor);
  },
  { flush: 'post' }
);
</script>
<template />
