<script setup lang="ts">
import { $createCodeNode } from '@lexical/code';
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  type LexicalEditor
} from 'lexical';
import { $wrapNodes } from '@lexical/selection';
import type { HeadingTagType } from '@lexical/rich-text';
import { $createHeadingNode } from '@lexical/rich-text';
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND
} from '@lexical/list';
import { blockTypeToBlockName, blockTypeToIcon } from './shared';
import { ref } from 'vue';

const props = defineProps<{
  editor: LexicalEditor;
  blockType: keyof typeof blockTypeToBlockName;
}>();

function formatParagraph() {
  if (props.blockType !== 'paragraph') {
    props.editor.update(() => {
      const selection = $getSelection();

      if ($isRangeSelection(selection)) $wrapNodes(selection, () => $createParagraphNode());
    });
  }
}

function formatHeading(headingSize: HeadingTagType) {
  if (props.blockType !== headingSize) {
    props.editor.update(() => {
      const selection = $getSelection();

      if ($isRangeSelection(selection)) {
        $wrapNodes(selection, () => $createHeadingNode(headingSize));
      }
    });
  }
}

function formatBulletList() {
  if (props.blockType !== 'bullet')
    props.editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
  else props.editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
}

function formatNumberedList() {
  if (props.blockType !== 'number')
    props.editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
  else props.editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
}

function formatCode() {
  if (props.blockType !== 'custom-code') {
    props.editor.update(() => {
      const selection = $getSelection();

      if ($isRangeSelection(selection)) {
        if (selection.isCollapsed()) {
          $wrapNodes(selection, () => $createCodeNode());
        } else {
          const textContent = selection.getTextContent();
          const codeNode = $createCodeNode();
          selection.insertNodes([codeNode]);
          selection.insertRawText(textContent);
        }
      }
    });
  }
}

const dropdownItems = ref<{ type: keyof typeof blockTypeToBlockName; action: () => void }[]>([
  {
    type: 'paragraph',
    action: formatParagraph
  },
  {
    type: 'h1',
    action: () => formatHeading('h1')
  },
  {
    type: 'h2',
    action: () => formatHeading('h2')
  },
  {
    type: 'h3',
    action: () => formatHeading('h3')
  },
  {
    type: 'bullet',
    action: formatBulletList
  },
  {
    type: 'number',
    action: formatNumberedList
  },
  {
    type: 'custom-code',
    action: formatCode
  }
]);
const isBlockDropdownOpen = defineModel<boolean>('modelValue');
</script>

<template>
  <q-btn-dropdown
    v-model="isBlockDropdownOpen"
    :icon="blockTypeToIcon[blockType]"
    :label="blockTypeToBlockName[blockType]"
    flat
    padding="sm"
    aria-label="Formatting options for text style"
  >
    <q-list>
      <q-item
        v-for="item in dropdownItems"
        :key="item.type"
        v-close-popup
        clickable
        :active="blockType === item.type"
        active-class="active"
        @click="item.action"
      >
        <q-item-section avatar>
          <q-icon :name="blockTypeToIcon[item.type]" />
        </q-item-section>
        <q-item-section>
          <q-item-label>{{ blockTypeToBlockName[item.type] }}</q-item-label>
        </q-item-section>
      </q-item>
    </q-list>
  </q-btn-dropdown>
</template>
