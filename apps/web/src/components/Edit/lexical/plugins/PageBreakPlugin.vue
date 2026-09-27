<script setup lang="ts">
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { useLexicalComposer } from 'lexical-vue';
import { onMounted, onUnmounted } from 'vue';
import { $insertNodeToNearestRoot } from '@lexical/utils';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_EDITOR } from 'lexical';

import { $createPageBreakNode, PageBreakNode } from '../nodes/PageBreakNode';
import { INSERT_PAGE_BREAK_COMMAND } from '../nodes/PageBreakNode';

const editor = useLexicalComposer();

onMounted(() => {
  if (!editor.hasNodes([PageBreakNode])) {
    throw new Error('PageBreakPlugin: PageBreakNode is not registered on editor');
  }

  const unregisterListener = editor.registerCommand(
    INSERT_PAGE_BREAK_COMMAND,
    () => {
      const selection = $getSelection();

      if (!$isRangeSelection(selection)) {
        return false;
      }

      const focusNode = selection.focus.getNode();
      if (focusNode !== null) {
        const pgBreak = $createPageBreakNode();
        $insertNodeToNearestRoot(pgBreak);
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
