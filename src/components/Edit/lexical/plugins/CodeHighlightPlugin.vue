<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { registerCodeHighlighting } from '@lexical/code';
import { useLexicalComposer } from 'lexical-vue';

const editor = useLexicalComposer();

onMounted(() => {
  const unregisterListener = registerCodeHighlighting(editor);
  onUnmounted(() => {
    unregisterListener?.();
  });
});
</script>
<template />
