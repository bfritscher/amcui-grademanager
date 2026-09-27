<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import { useLexicalComposer, useLexicalNodeSelection } from 'lexical-vue';
import { addClassNamesToElement, mergeRegister, removeClassNamesFromElement } from '@lexical/utils';

import {
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_DELETE_COMMAND,
  KEY_BACKSPACE_COMMAND,
  $getNodeByKey,
  $isNodeSelection,
  $getSelection
} from 'lexical';
import { $isHorizontalRuleNode } from './LexicalHorizontalRuleNode';

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
    if ($isHorizontalRuleNode(node)) {
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
      const hrElem = editor.getElementByKey(nodeKey);

      if (event.target === hrElem) {
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
      const hrElem = editor.getElementByKey(nodeKey);
      const isSelectedClassName = 'selected';

      if (hrElem) {
        if (newValue) {
          addClassNamesToElement(hrElem, isSelectedClassName);
        } else {
          removeClassNamesFromElement(hrElem, isSelectedClassName);
        }
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
