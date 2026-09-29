<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useLexicalComposer } from 'lexical-vue';
import { registerTablePlugin, registerTableSelectionObserver } from '@lexical/table';
import { mergeRegister } from '@lexical/utils';

const editor = useLexicalComposer();
let unregister: (() => void) | undefined;

onMounted(() => {
  // Register once after ContentEditable has mounted. The upstream setup-time
  // watchEffect can re-enter observer registration when loading existing tables.
  unregister = mergeRegister(registerTablePlugin(editor), registerTableSelectionObserver(editor));
});

onUnmounted(() => unregister?.());
</script>
<template />
