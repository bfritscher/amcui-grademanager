<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import { useLexicalComposer, useLexicalNodeSelection } from 'lexical-vue';
import { mergeRegister } from '@lexical/utils';
import { $isPageBreakNode } from './PageBreakNode';

import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND
} from 'lexical';

const props = defineProps({
  nodeKey: {
    type: String,
    required: true
  }
});

const { nodeKey } = props;

const editor = useLexicalComposer();

const { isSelected, setSelected, clearSelection } = useLexicalNodeSelection(props.nodeKey);

const $onDelete = (event: KeyboardEvent) => {
  if (isSelected.value && $isNodeSelection($getSelection())) {
    event.preventDefault();
    const node = $getNodeByKey(nodeKey);
    if ($isPageBreakNode(node)) {
      node.remove();
      return true;
    }
  }
  return false;
};

const registerCommands = () => {
  const clickCommand = editor.registerCommand(
    CLICK_COMMAND,
    (event) => {
      const pbElem = editor.getElementByKey(nodeKey);

      if (event.target === pbElem) {
        if (!event.shiftKey) {
          clearSelection();
        }
        setSelected(!isSelected.value);
        return true;
      }
      return false;
    },
    COMMAND_PRIORITY_LOW
  );

  const deleteCommand = editor.registerCommand(KEY_DELETE_COMMAND, $onDelete, COMMAND_PRIORITY_LOW);

  const backspaceCommand = editor.registerCommand(
    KEY_BACKSPACE_COMMAND,
    $onDelete,
    COMMAND_PRIORITY_LOW
  );

  return mergeRegister(clickCommand, deleteCommand, backspaceCommand);
};

onMounted(() => {
  const unregisterCommands = registerCommands();

  // Add/Remove Class based on selection
  watch(
    isSelected,
    (newValue) => {
      const pbElem = editor.getElementByKey(nodeKey);
      if (pbElem) {
        pbElem.className = newValue ? 'selected' : '';
      }
    },
    { immediate: true }
  );

  // Cleanup
  onUnmounted(() => {
    unregisterCommands();
  });
});
</script>
<template />
<style>
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/* @import url('assets/styles/variables.css'); */

[type='page-break'] {
  position: relative;
  display: block;
  width: calc(100% + var(--editor-input-padding, 36px));
  overflow: unset;
  margin-left: calc(var(--editor-input-padding, 28px) * -1);
  margin-top: var(--editor-input-padding, 28px);
  margin-bottom: var(--editor-input-padding, 28px);

  border: none;
  border-top: 1px dashed var(--editor-color-secondary, #eeeeee);
  border-bottom: 1px dashed var(--editor-color-secondary, #eeeeee);
  background-color: var(--editor-color-secondary, #eeeeee);
}

[type='page-break']::before {
  content: 'content_cut';
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  font-size: 20px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  position: absolute;
  top: 50%;
  left: calc(var(--editor-input-padding, 28px) + 12px);
  transform: translateY(-50%);
  opacity: 0.5;
}

[type='page-break']::after {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);

  display: block;
  padding: 2px 6px;
  border: 1px solid #ccc;
  background-color: #fff;

  content: 'PAGE BREAK';
  font-size: 12px;
  color: #000;
  font-weight: 600;
}

.selected[type='page-break'] {
  border-color: var(--editor-color-primary, #4766cb);
}

.selected[type='page-break']::before {
  opacity: 1;
}
</style>
