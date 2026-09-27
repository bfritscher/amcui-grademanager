<script setup lang="ts">
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {
  $deleteTableColumn__EXPERIMENTAL,
  $deleteTableRow__EXPERIMENTAL,
  $getTableCellNodeFromLexicalNode,
  $getTableNodeFromLexicalNodeOrThrow,
  $insertTableColumn__EXPERIMENTAL,
  $insertTableRow__EXPERIMENTAL,
  $isTableSelection,
  getTableObserverFromTableElement,
  TableCellNode
} from '@lexical/table';

import type { HTMLTableElementWithWithTableSelectionState, TableSelection } from '@lexical/table';

import { $getRoot, $getSelection, $isRangeSelection } from 'lexical';
import { onMounted, onUnmounted, ref, watchEffect } from 'vue';
import { useLexicalComposer } from 'lexical-vue';
import { useStore } from '@/stores/store';

const props = defineProps({
  anchorElem: {
    type: Object,
    required: true
  }
});

const editor = useLexicalComposer();
const store = useStore();

const dropDownRef = ref<HTMLDivElement | null>(null);
const tableCellNode = ref<TableCellNode | null>(null);
const selectionCounts = ref({ columns: 1, rows: 1 });
const menuButtonRef = ref<HTMLDivElement | null>(null);
const menuRootRef = ref<HTMLDivElement | null>(null);
const isMenuOpen = ref(false);

function computeSelectionCount(selection: TableSelection): {
  columns: number;
  rows: number;
} {
  const selectionShape = selection.getShape();
  return {
    columns: selectionShape.toX - selectionShape.fromX + 1,
    rows: selectionShape.toY - selectionShape.fromY + 1
  };
}

onMounted(() => {
  const unregister = editor.registerMutationListener(TableCellNode, (nodeMutations) => {
    if (!tableCellNode.value) return;
    const nodeUpdated = nodeMutations.get(tableCellNode.value.getKey()) === 'updated';

    if (nodeUpdated) {
      editor.getEditorState().read(() => {
        if (!tableCellNode.value) return;
        tableCellNode.value = tableCellNode.value.getLatest();
      });
    }
  });

  onUnmounted(() => {
    unregister();
  });
});

watchEffect(() => {
  const menuButtonElement = menuRootRef.value;
  const dropDownElement = dropDownRef.value;
  const rootElement = editor.getRootElement();

  if (menuButtonElement != null && dropDownElement != null && rootElement != null) {
    dropDownElement.style.opacity = '1';
    const leftPosition = 20; //  menuButtonRect.right + margin
    dropDownElement.style.left = `${leftPosition}px`;

    const topPosition = 5; //margin // menuButtonRect.top
    dropDownElement.style.top = `${topPosition}px`;
  }
});

function handleClickOutside(event: MouseEvent) {
  if (
    dropDownRef.value != null &&
    menuRootRef.value != null &&
    !dropDownRef.value.contains(event.target as Node)
  ) {
    isMenuOpen.value = false;
  }
}

onMounted(() => {
  window.addEventListener('click', handleClickOutside);
});
onUnmounted(() => {
  window.removeEventListener('click', handleClickOutside);
});

const clearTableSelection = () => {
  editor.update(() => {
    if (!tableCellNode.value) return;
    if (tableCellNode.value.isAttached()) {
      const tableNode = $getTableNodeFromLexicalNodeOrThrow(tableCellNode.value);
      const tableElement = editor.getElementByKey(
        tableNode.getKey()
      ) as HTMLTableElementWithWithTableSelectionState;

      if (!tableElement) {
        throw new Error('Expected to find tableElement in DOM');
      }

      const tableSelection = getTableObserverFromTableElement(tableElement);
      if (tableSelection !== null) {
        tableSelection.$clearHighlight();
      }

      tableNode.markDirty();
      tableCellNode.value = tableCellNode.value.getLatest();
    }

    const rootNode = $getRoot();
    rootNode.selectStart();
  });
};

const insertTableRowAtSelection = (shouldInsertAfter: boolean) => {
  editor.update(() => {
    for (let i = 0; i < selectionCounts.value.rows; i++) {
      $insertTableRow__EXPERIMENTAL(shouldInsertAfter);
    }
    isMenuOpen.value = false;
  });
};

const insertTableColumnAtSelection = (shouldInsertAfter: boolean) => {
  editor.update(() => {
    for (let i = 0; i < selectionCounts.value.columns; i++) {
      $insertTableColumn__EXPERIMENTAL(shouldInsertAfter);
    }
    isMenuOpen.value = false;
  });
};

const deleteTableRowAtSelection = () => {
  editor.update(() => {
    $deleteTableRow__EXPERIMENTAL();
    clearTableSelection();
    isMenuOpen.value = false;
  });
};

const deleteTableAtSelection = () => {
  editor.update(() => {
    if (!tableCellNode.value) return;
    const tableNode = $getTableNodeFromLexicalNodeOrThrow(tableCellNode.value);
    tableNode.remove();

    clearTableSelection();
    isMenuOpen.value = false;
  });
};

const deleteTableColumnAtSelection = () => {
  editor.update(() => {
    $deleteTableColumn__EXPERIMENTAL();
    clearTableSelection();
    isMenuOpen.value = false;
  });
};

watchEffect(() => {
  const menuButtonDOM = menuButtonRef.value as HTMLButtonElement | null;
  if (menuButtonDOM != null && tableCellNode.value != null) {
    const tableCellNodeDOM = editor.getElementByKey(tableCellNode.value.getKey());

    if (tableCellNodeDOM != null) {
      const tableCellRect = tableCellNodeDOM.getBoundingClientRect();
      const menuRect = menuButtonDOM.getBoundingClientRect();
      const anchorRect = props.anchorElem.getBoundingClientRect();

      const top = tableCellRect.top - anchorRect.top + 4;
      const left = tableCellRect.right - menuRect.width - 10 - anchorRect.left;

      menuButtonDOM.style.opacity = '1';
      menuButtonDOM.style.transform = `translate(${left}px, ${top}px)`;
    } else {
      menuButtonDOM.style.opacity = '0';
      menuButtonDOM.style.transform = 'translate(-10000px, -10000px)';
    }
  }

  const prevTableCellDOM = ref(tableCellNode.value);

  if (prevTableCellDOM.value !== tableCellNode.value) {
    isMenuOpen.value = false;
  }

  prevTableCellDOM.value = tableCellNode.value;
});
function $moveMenu() {
  const menu = menuButtonRef.value;
  const selection = $getSelection();
  const nativeSelection = window.getSelection();
  const activeElement = document.activeElement;

  if (selection == null || menu == null) {
    tableCellNode.value = null;
    return;
  }

  const rootElement = editor.getRootElement();

  if (
    $isRangeSelection(selection) &&
    rootElement !== null &&
    nativeSelection !== null &&
    rootElement.contains(nativeSelection.anchorNode)
  ) {
    const tableCellNodeFromSelection = $getTableCellNodeFromLexicalNode(selection.anchor.getNode());

    if (tableCellNodeFromSelection == null) {
      tableCellNode.value = null;
      return;
    }

    const tableCellParentNodeDOM = editor.getElementByKey(tableCellNodeFromSelection.getKey());

    if (tableCellParentNodeDOM == null) {
      tableCellNode.value = null;
      return;
    }
    tableCellNode.value = tableCellNodeFromSelection;
  } else if (!activeElement) {
    tableCellNode.value = null;
  }
}

onMounted(() => {
  const unregister = editor.registerUpdateListener(() => {
    editor.getEditorState().read(() => {
      $moveMenu();
    });
  });
  onUnmounted(() => {
    unregister();
  });
});

watchEffect(() => {
  if (isMenuOpen.value) {
    // sync to store for blur fix
    store.tableActionMenuOpen = true;
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if ($isTableSelection(selection)) {
        selectionCounts.value = computeSelectionCount(selection);
      }
    });
  } else {
    store.tableActionMenuOpen = false;
  }
});
</script>
<template>
  <Teleport :to="anchorElem">
    <div ref="menuButtonRef" class="table-cell-action-button-container">
      <button
        v-if="tableCellNode"
        ref="menuRootRef"
        type="button"
        class="table-cell-action-button"
        @click.stop="isMenuOpen = !isMenuOpen"
      >
        <q-icon name="sym_o_keyboard_arrow_down" />
      </button>
      <div v-if="isMenuOpen" ref="dropDownRef" class="dropdown" @click.stop>
        <button
          type="button"
          class="item"
          data-test-id="table-insert-row-below"
          @click="insertTableRowAtSelection(true)"
        >
          <span class="text">
            Insert {{ selectionCounts.rows === 1 ? 'row' : `${selectionCounts.rows} rows` }}
            below
          </span>
        </button>
        <hr />
        <button
          type="button"
          class="item"
          data-test-id="table-insert-column-after"
          @click="insertTableColumnAtSelection(true)"
        >
          <span class="text">
            Insert
            {{ selectionCounts.columns === 1 ? 'column' : `${selectionCounts.columns} columns` }}
            right
          </span>
        </button>
        <hr />
        <button
          type="button"
          class="item"
          data-test-id="table-delete-columns"
          @click="deleteTableColumnAtSelection()"
        >
          <span class="text">Delete column</span>
        </button>
        <button
          type="button"
          class="item"
          data-test-id="table-delete-rows"
          @click="deleteTableRowAtSelection()"
        >
          <span class="text">Delete row</span>
        </button>
        <button
          type="button"
          class="item"
          data-test-id="table-delete"
          @click="deleteTableAtSelection()"
        >
          <span class="text">Delete table</span>
        </button>
      </div>
    </div>
  </Teleport>
</template>
<style>
.dropdown {
  z-index: 100;
  display: block;
  position: fixed;
  box-shadow:
    0 12px 28px 0 rgba(0, 0, 0, 0.2),
    0 2px 4px 0 rgba(0, 0, 0, 0.1),
    inset 0 0 0 1px rgba(255, 255, 255, 0.5);
  border-radius: 8px;
  min-height: 40px;
  background-color: #fff;
}

.dropdown .item {
  margin: 0 8px 0 8px;
  padding: 8px;
  color: #050505;
  cursor: pointer;
  line-height: 16px;
  font-size: 15px;
  display: flex;
  align-content: center;
  flex-direction: row;
  flex-shrink: 0;
  justify-content: space-between;
  background-color: #fff;
  border-radius: 8px;
  border: 0;
  max-width: 250px;
  min-width: 100px;
}

.dropdown .item.fontsize-item,
.dropdown .item.fontsize-item .text {
  min-width: unset;
}

.dropdown .item .active {
  display: flex;
  width: 20px;
  height: 20px;
  background-size: contain;
}

.dropdown .item:first-child {
  margin-top: 8px;
}

.dropdown .item:last-child {
  margin-bottom: 8px;
}

.dropdown .item:hover {
  background-color: #eee;
}

.dropdown .item .text {
  display: flex;
  line-height: 20px;
  flex-grow: 1;
  min-width: 150px;
}

.dropdown .item .icon {
  display: flex;
  width: 20px;
  height: 20px;
  user-select: none;
  margin-right: 12px;
  line-height: 16px;
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
}

.dropdown .divider {
  width: auto;
  background-color: #eee;
  margin: 4px 8px;
  height: 1px;
}

@media screen and (max-width: 1100px) {
  .dropdown-button-text {
    display: none !important;
  }

  .dialog-dropdown > .dropdown-button-text {
    display: flex !important;
  }

  .font-size .dropdown-button-text {
    display: flex !important;
  }

  .code-language .dropdown-button-text {
    display: flex !important;
  }
}

.table-cell-action-button {
  background-color: none;
  display: flex;
  justify-content: center;
  align-items: center;
  border: 0;
  position: relative;
  border-radius: 15px;
  color: #222;
  display: inline-block;
  cursor: pointer;
}

.table-cell-action-button-container {
  position: absolute;
  top: 0;
  left: 0;
  will-change: transform;
}
</style>
