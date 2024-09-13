<script setup lang="ts">
import { useLexicalComposer } from 'lexical-vue';
import { onMounted, onUnmounted } from 'vue';
import { $generateHtmlFromNodes } from '@lexical/html';
import { BLUR_COMMAND, FOCUS_COMMAND, COMMAND_PRIORITY_LOW } from 'lexical';
import { mergeRegister } from '@lexical/utils';

const editor = useLexicalComposer();

const emit = defineEmits(['change', 'focus', 'blur']);

let html = '';
let blurTimeout: number | null = null;
onMounted(() => {
  const unregisterListener = editor.registerUpdateListener(({ editorState }) => {
    editorState.read(() => {
      const newHTML = $generateHtmlFromNodes(editor, null);
      if (html !== newHTML) {
        emit('change', newHTML);
      }
      html = newHTML;
    });
  });
  const unregisterCommands = mergeRegister(
    editor.registerCommand(
      BLUR_COMMAND,
      () => {
        if (blurTimeout) {
          window.clearTimeout(blurTimeout);
        }
        blurTimeout = window.setTimeout(() => {
          blurTimeout = null;
          emit('blur');
        }, 500);
        return false;
      },
      COMMAND_PRIORITY_LOW
    ),
    editor.registerCommand(
      FOCUS_COMMAND,
      () => {
        if (blurTimeout) {
          window.clearTimeout(blurTimeout);
        }
        emit('focus');
        return false;
      },
      COMMAND_PRIORITY_LOW
    )
  );
  onUnmounted(() => {
    unregisterListener?.();
    unregisterCommands?.();
  });
});
</script>
<template />
