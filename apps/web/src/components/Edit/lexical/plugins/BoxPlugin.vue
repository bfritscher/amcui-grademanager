<script setup lang="ts">
import { useLexicalComposer } from 'lexical-vue';
import { onMounted, onUnmounted } from 'vue';
import { $insertNodeToNearestRoot } from '@lexical/utils';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_EDITOR } from 'lexical';

import { $createBoxNode, BoxNode } from '../nodes/BoxNode';
import { INSERT_BOX_COMMAND } from '../nodes/BoxNode';

const editor = useLexicalComposer();

onMounted(() => {
  if (!editor.hasNodes([BoxNode])) {
    throw new Error('BoxPlugin: BoxNode is not registered on editor');
  }

  const unregisterListener = editor.registerCommand(
    INSERT_BOX_COMMAND,
    () => {
      const selection = $getSelection();

      if (!$isRangeSelection(selection)) {
        return false;
      }

      const focusNode = selection.focus.getNode();
      if (focusNode !== null) {
        const box = $createBoxNode();
        $insertNodeToNearestRoot(box);
      }

      return true;
    },
    COMMAND_PRIORITY_EDITOR
  );
  onUnmounted(() => {
    unregisterListener?.();
  });
});
</script>
<template />
