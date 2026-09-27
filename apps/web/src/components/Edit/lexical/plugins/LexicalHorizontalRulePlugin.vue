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

import { $createHorizontalRuleNode, HorizontalRuleNode } from '../nodes/LexicalHorizontalRuleNode';
import { $insertNodeToNearestRoot } from '@lexical/utils';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_EDITOR } from 'lexical';
import { INSERT_HORIZONTAL_RULE_COMMAND } from '../nodes/LexicalHorizontalRuleNode';

const editor = useLexicalComposer();

onMounted(() => {
  if (!editor.hasNodes([HorizontalRuleNode])) {
    throw new Error(
      'LexicalHorizontalRulePlugin: LexicalHorizontalRuleNode is not registered on editor'
    );
  }

  const unregisterListener = editor.registerCommand(
    INSERT_HORIZONTAL_RULE_COMMAND,
    () => {
      const selection = $getSelection();

      if (!$isRangeSelection(selection)) {
        return false;
      }

      const focusNode = selection.focus.getNode();

      if (focusNode !== null) {
        const horizontalRuleNode = $createHorizontalRuleNode();
        $insertNodeToNearestRoot(horizontalRuleNode);
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
