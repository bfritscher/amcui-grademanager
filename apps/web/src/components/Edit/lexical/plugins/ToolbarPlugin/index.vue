<script setup lang="ts">
import { useQuasar } from 'quasar';
import type { CommandListenerPriority, ElementFormatType } from 'lexical';
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $isTextNode,
  $isElementNode,
  $selectAll,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  $isNodeSelection
} from 'lexical';
import { $getSelectionStyleValueForProperty, $isParentElementRTL } from '@lexical/selection';
import {
  $findMatchingParent,
  $getNearestBlockElementAncestorOrThrow,
  $getNearestNodeOfType,
  mergeRegister
} from '@lexical/utils';
import { $isDecoratorBlockNode, useLexicalComposer } from 'lexical-vue';
import { onMounted, onUnmounted, ref, watchEffect } from 'vue';
import { $isListNode, ListNode } from '@lexical/list';
import { $isHeadingNode } from '@lexical/rich-text';
import { CODE_LANGUAGE_MAP, getLanguageFriendlyName } from '@lexical/code';
import { $isCustomCodeNode } from '../../nodes/CustomCodeNode';
import { $isImageNode } from '../../nodes/ImageNode';
import BlockFormatDropDown from './BlockFormatDropDown.vue';
import { blockTypeToBlockName } from './shared';
import { INSERT_HORIZONTAL_RULE_COMMAND } from '../../nodes/LexicalHorizontalRuleNode';
import { INSERT_PAGE_BREAK_COMMAND } from '../../nodes/PageBreakNode';
import { getSelectedNode } from '../../utils/getSelectedNode';
import InsertTableDialog from '../Table/InsertTableDialog.vue';
import { INSERT_BOX_COMMAND } from '../../nodes/BoxNode';
import { INSERT_IMAGE_COMMAND } from '../../nodes/ImageNode';
import GraphicsManagerDialog from '@/components/Edit/GraphicsManagerDialog.vue';
import type { Graphics } from '@/components/models';
import ExcalidrawDialog from '@/components/Edit/ExcalidrawDialog.vue';

const showDebug = defineModel<boolean>('debug');

const CODE_LANGUAGE_FRIENDLY_NAME_MAP = {
  html: 'HTML',
  css: 'CSS',
  js: 'JavaScript',
  sql: 'SQL',
  java: 'Java',
  py: 'Python'
};

const LowPriority: CommandListenerPriority = 1;

const editor = useLexicalComposer();
const $q = useQuasar();

const fontSize = ref('15px');
const fontColor = ref<string>('#000');
const bgColor = ref<string>('#fff');
const canUndo = ref(false);
const canRedo = ref(false);
const blockType = ref<keyof typeof blockTypeToBlockName>('paragraph');
const type = ref('');
const selectedElementKey = ref();
const codeLanguage = ref('');
const codeBorder = ref(false);
const codeNumbers = ref(false);
const imageBorder = ref(false);
const imageWidth = ref(100);
const imageOptions = ref('');
const isRTL = ref(false);
const fontFamily = ref<string>('Arial');
const isBold = ref(false);
const isItalic = ref(false);
const isUnderline = ref(false);
const isStrikethrough = ref(false);

const isSubscript = ref(false);
const isSuperscript = ref(false);
const isCode = ref(false);
const isLatex = ref(false);

const elementFormat = ref<ElementFormatType>('left');

function $updateToolbar() {
  const selection = $getSelection();
  if ($isNodeSelection(selection)) {
    blockType.value = 'paragraph';
    const node = selection.getNodes()[0];
    if (!node) return;
    selectedElementKey.value = node.getKey();
    type.value = node.getType();
    if ($isImageNode(node)) {
      imageBorder.value = node.getBorder();
      imageWidth.value = node.getWidth();
      imageOptions.value = node.getOptions() || '';
    }
  } else if ($isRangeSelection(selection)) {
    const anchorNode = selection.anchor.getNode();
    let element =
      anchorNode.getKey() === 'root'
        ? anchorNode
        : $findMatchingParent(anchorNode, (e) => {
            const parent = e.getParent();
            return parent !== null && $isRootOrShadowRoot(parent);
          });
    if (element === null) element = anchorNode.getTopLevelElementOrThrow();

    const elementKey = element.getKey();
    const elementDOM = editor.getElementByKey(elementKey);

    // Update text format
    isBold.value = selection.hasFormat('bold');
    isItalic.value = selection.hasFormat('italic');
    isUnderline.value = selection.hasFormat('underline');
    isStrikethrough.value = selection.hasFormat('strikethrough');
    isSubscript.value = selection.hasFormat('subscript');
    isSuperscript.value = selection.hasFormat('superscript');
    isCode.value = selection.hasFormat('code');
    isRTL.value = $isParentElementRTL(selection);
    isLatex.value = selection.hasFormat('highlight');

    if (elementDOM !== null) {
      selectedElementKey.value = elementKey;
      if ($isListNode(element)) {
        const parentList = $getNearestNodeOfType<ListNode>(anchorNode, ListNode);
        const type = parentList ? parentList.getListType() : element.getListType();
        blockType.value = type;
      } else {
        type.value = $isHeadingNode(element) ? element.getTag() : element.getType();

        if (type.value in blockTypeToBlockName) {
          blockType.value = type.value as keyof typeof blockTypeToBlockName;
        }

        if ($isCustomCodeNode(element)) {
          const language = element.getLanguage() as keyof typeof CODE_LANGUAGE_MAP;
          codeLanguage.value = language ? CODE_LANGUAGE_MAP[language] || language : '';
          codeBorder.value = element.getBorder();
          codeNumbers.value = element.getNumbers();
        }
      }
    }

    // Handle buttons
    fontSize.value = $getSelectionStyleValueForProperty(selection, 'font-size', '15px');
    fontColor.value = $getSelectionStyleValueForProperty(selection, 'color', '#000');
    bgColor.value = $getSelectionStyleValueForProperty(selection, 'background-color', '#fff');
    fontFamily.value = $getSelectionStyleValueForProperty(selection, 'font-family', 'Arial');

    const node = getSelectedNode(selection);
    const parent = node?.getParent();
    elementFormat.value = $isElementNode(node)
      ? node.getFormatType()
      : parent?.getFormatType() || 'left';
  }
}

function getCodeLanguageOptions(): [string, string][] {
  const options: [string, string][] = [];

  for (const [lang, friendlyName] of Object.entries(CODE_LANGUAGE_FRIENDLY_NAME_MAP))
    options.push([lang, friendlyName]);

  return options;
}

const CODE_LANGUAGE_OPTIONS = getCodeLanguageOptions();

onMounted(() => {
  const unregisterMergeListener = mergeRegister(
    editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        $updateToolbar();
      });
    }),
    editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        $updateToolbar();
        return false;
      },
      LowPriority
    ),
    editor.registerCommand(
      CAN_UNDO_COMMAND,
      (payload: boolean) => {
        canUndo.value = payload;
        return false;
      },
      LowPriority
    ),
    editor.registerCommand(
      CAN_REDO_COMMAND,
      (payload: boolean) => {
        canRedo.value = payload;
        return false;
      },
      LowPriority
    )
  );

  onUnmounted(() => {
    unregisterMergeListener();
  });
});

function clearFormatting() {
  editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      $selectAll();
      selection.getNodes().forEach((node) => {
        if ($isTextNode(node)) {
          node.setFormat(0);
          node.setStyle('');
          $getNearestBlockElementAncestorOrThrow(node).setFormat('');
        }
        if ($isDecoratorBlockNode(node)) node.setFormat('');
      });
    }
  });
}

function onCodeLanguageSelect(value: string) {
  editor.update(() => {
    if (selectedElementKey.value !== null) {
      const node = $getNodeByKey(selectedElementKey.value);
      if ($isCustomCodeNode(node)) node.setLanguage(value);
    }
  });
}

function toggleCodeBorder() {
  editor.update(() => {
    if (selectedElementKey.value !== null) {
      const node = $getNodeByKey(selectedElementKey.value);
      if ($isCustomCodeNode(node)) node.setBorder(!node.getBorder());
    }
  });
}

function toggleCodeNumbers() {
  editor.update(() => {
    if (selectedElementKey.value !== null) {
      const node = $getNodeByKey(selectedElementKey.value);
      if ($isCustomCodeNode(node)) node.setNumbers(!node.getNumbers());
    }
  });
}

function toggleImageBorder() {
  editor.update(() => {
    if (selectedElementKey.value !== null) {
      const node = $getNodeByKey(selectedElementKey.value);
      if ($isImageNode(node)) node.setBorder(!node.getBorder());
    }
  });
}

function setImageWidth(value: string | number | null) {
  if (value === null) return;
  value = parseInt(value as string, 10);
  editor.update(() => {
    if (selectedElementKey.value !== null) {
      const node = $getNodeByKey(selectedElementKey.value);
      if ($isImageNode(node)) node.setWidth(value);
    }
  });
}

function setImageOptions(value: string | number | null) {
  editor.update(() => {
    if (selectedElementKey.value !== null) {
      const node = $getNodeByKey(selectedElementKey.value);
      if ($isImageNode(node)) node.setOptions(String(value) || '');
    }
  });
}

function showInsertTableDialog() {
  isTableDialogOpen.value = true;
  $q.dialog({
    component: InsertTableDialog,
    componentProps: {
      activeEditor: editor
    },
    persistent: true
  }).onDismiss(() => {
    isTableDialogOpen.value = false;
  });
}

function showGraphicsManager() {
  isGraphicsDialogOpen.value = true;
  $q.dialog({
    component: GraphicsManagerDialog
  })
    .onOk((item: Graphics) => {
      if (item) {
        editor.dispatchCommand(INSERT_IMAGE_COMMAND, item);
      }
    })
    .onDismiss(() => {
      isGraphicsDialogOpen.value = false;
    });
}

function insertExcalidraw() {
  $q.dialog({
    component: ExcalidrawDialog
  }).onOk((item: Graphics) => {
    if (item) {
      editor.dispatchCommand(INSERT_IMAGE_COMMAND, item);
    }
  });
}

const isBlockDropdownOpen = ref(false);
const isLanguageDropdownOpen = ref(false);
const isFormattingDropdownOpen = ref(false);
const isInsertDropdownOpen = ref(false);
const isTableDialogOpen = ref(false);
const isGraphicsDialogOpen = ref(false);
const isEditing = ref(false);

const isActive = defineModel<boolean>('active');

watchEffect(() => {
  const isSomeOpen = [
    isBlockDropdownOpen,
    isLanguageDropdownOpen,
    isFormattingDropdownOpen,
    isInsertDropdownOpen,
    isTableDialogOpen,
    isGraphicsDialogOpen,
    isEditing
  ].some((r) => r.value);
  if (isSomeOpen) {
    isActive.value = true;
  } else {
    isActive.value = false;
  }
});
</script>

<template>
  <q-toolbar class="lexical-toolbar">
    <BlockFormatDropDown v-model="isBlockDropdownOpen" :block-type="blockType" :editor="editor" />
    <q-separator vertical inset class="q-mx-xs" />
    <template v-if="blockType === 'custom-code'">
      <q-btn-dropdown
        v-model="isLanguageDropdownOpen"
        flat
        padding="sm"
        :label="getLanguageFriendlyName(codeLanguage)"
        aria-label="Select language"
      >
        <q-list>
          <q-item
            v-for="[value, name] in CODE_LANGUAGE_OPTIONS"
            :key="value"
            v-close-popup
            clickable
            :active="value === codeLanguage"
            active-class="active"
            @click="onCodeLanguageSelect(value)"
          >
            <q-item-section>
              <q-item-label>{{ name }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </q-btn-dropdown>
      <q-separator vertical inset class="q-mx-xs" />
      <q-checkbox
        label="Line Numbers"
        class="q-mx-xs"
        :model-value="codeNumbers"
        @update:model-value="() => toggleCodeNumbers()"
      />
      <q-checkbox
        label="Border"
        :model-value="codeBorder"
        @update:model-value="() => toggleCodeBorder()"
      />
    </template>
    <template v-else-if="type === 'image'">
      <q-checkbox
        label="Border"
        class="q-mx-xs"
        :model-value="imageBorder"
        @focus="isEditing = true"
        @blur="isEditing = false"
        @update:model-value="() => toggleImageBorder()"
      />
      <q-input
        label="Width %"
        class="q-mx-xs"
        type="number"
        min="0"
        max="100"
        step="5"
        dense
        style="min-width: 80px"
        :model-value="imageWidth"
        @focus="isEditing = true"
        @blur="isEditing = false"
        @update:model-value="setImageWidth"
      />
      <q-input
        label="LaTeX Options"
        dense
        :model-value="imageOptions"
        @focus="isEditing = true"
        @blur="isEditing = false"
        @update:model-value="setImageOptions"
      >
        <template #after>
          <q-icon name="sym_o_help">
            <q-tooltip>
              Provide LaTeX includegraphics options overrides: width=\textwidth
            </q-tooltip>
          </q-icon>
        </template>
      </q-input>
    </template>
    <template v-else>
      <q-btn
        class="q-mr-xs"
        :class="`${isBold ? 'active' : ''}`"
        aria-label="Format Bold"
        icon="sym_o_format_bold"
        flat
        padding="sm"
        @click="editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')"
      />
      <q-btn
        class="q-mr-xs"
        :class="`${isItalic ? 'active' : ''}`"
        aria-label="Format Italics"
        icon="sym_o_format_italic"
        flat
        padding="sm"
        @click="editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')"
      />
      <q-btn
        class="q-mr-xs"
        :class="`${isCode ? 'active' : ''}`"
        aria-label="Insert Code"
        icon="sym_o_title"
        flat
        padding="sm"
        @click="editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')"
      />
      <q-btn
        class="q-mr-xs"
        :class="`${elementFormat === 'center' ? 'active' : ''}`"
        icon="sym_o_format_align_center"
        flat
        padding="sm"
        aria-label="Center text alignment"
        @click="
          editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, elementFormat === 'center' ? '' : 'center')
        "
      />
      <q-btn
        aria-label="Insert Image"
        icon="sym_o_image"
        flat
        padding="sm"
        @click="showGraphicsManager()"
      />
      <q-separator vertical inset class="q-mx-xs" />
      <q-btn-dropdown
        v-model="isFormattingDropdownOpen"
        aria-label="Formatting options for additional text styles"
        icon="sym_o_match_case"
        padding="sm"
        flat
      >
        <q-list>
          <q-item
            v-close-popup
            clickable
            :active="isUnderline"
            active-class="active"
            aria-label="Format text underlined"
            title="Underlined"
            @click="editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')"
          >
            <q-item-section avatar>
              <q-icon name="sym_o_format_underlined" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Underlined</q-item-label>
            </q-item-section>
          </q-item>

          <q-item
            v-close-popup
            clickable
            :active="isStrikethrough"
            active-class="active"
            aria-label="Format text with a strikethrough"
            title="Strikethrough"
            @click="editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')"
          >
            <q-item-section avatar>
              <q-icon name="sym_o_format_strikethrough" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Strikethrough</q-item-label>
            </q-item-section>
          </q-item>

          <q-item
            v-close-popup
            clickable
            :active="isSubscript"
            active-class="active"
            aria-label="Format text with a subscript"
            title="Subscript"
            @click="editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'subscript')"
          >
            <q-item-section avatar>
              <q-icon name="sym_o_subscript" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Subscript</q-item-label>
            </q-item-section>
          </q-item>

          <q-item
            v-close-popup
            clickable
            :active="isSuperscript"
            active-class="active"
            aria-label="Format text with a superscript"
            title="Superscript"
            @click="editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'superscript')"
          >
            <q-item-section avatar>
              <q-icon name="sym_o_superscript" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Superscript</q-item-label>
            </q-item-section>
          </q-item>

          <q-item
            v-close-popup
            clickable
            :active="isLatex"
            active-class="active"
            aria-label="Insert Latex"
            title="Superscript"
            @click="editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'highlight')"
          >
            <q-item-section avatar>
              <q-icon name="sym_o_design_services" />
            </q-item-section>
            <q-item-section>
              <q-item-label>LaTeX</q-item-label>
            </q-item-section>
          </q-item>
          <q-item
            v-close-popup
            clickable
            aria-label="Clear all text formatting"
            title="Clear text formatting"
            @click="clearFormatting"
          >
            <q-item-section avatar>
              <q-icon name="sym_o_format_clear" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Clear Formatting</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </q-btn-dropdown>
      <q-separator vertical inset class="q-mx-xs" />
      <q-btn-dropdown
        v-model="isInsertDropdownOpen"
        label="Insert"
        aria-label="Insert specialized editor node"
        icon="sym_o_add"
        padding="sm"
        flat
      >
        <q-list>
          <q-item
            v-close-popup
            clickable
            aria-label="Insert a horizontal rule"
            @click="editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)"
          >
            <q-item-section avatar>
              <q-icon name="sym_o_horizontal_rule" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Horizontal Rule</q-item-label>
            </q-item-section>
          </q-item>

          <q-item
            v-close-popup
            clickable
            aria-label="Insert a box"
            @click="editor.dispatchCommand(INSERT_BOX_COMMAND, undefined)"
          >
            <q-item-section avatar>
              <q-icon name="sym_o_check_box_outline_blank" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Box</q-item-label>
            </q-item-section>
          </q-item>

          <q-item
            v-close-popup
            clickable
            aria-label="Insert a table"
            @click="showInsertTableDialog"
          >
            <q-item-section avatar>
              <q-icon name="sym_o_table" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Table</q-item-label>
            </q-item-section>
          </q-item>

          <q-item
            v-close-popup
            clickable
            aria-label="Insert a page break"
            @click="editor.dispatchCommand(INSERT_PAGE_BREAK_COMMAND, undefined)"
          >
            <q-item-section avatar>
              <q-icon name="sym_o_cut" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Page Break</q-item-label>
            </q-item-section>
          </q-item>

          <q-item
            v-close-popup
            clickable
            aria-label="Insert a Excalidraw diagram"
            @click="insertExcalidraw"
          >
            <q-item-section avatar>
              <q-icon>
                <img src="@/assets/images/excalidraw-logo-black.svg" />
              </q-icon>
            </q-item-section>
            <q-item-section>
              <q-item-label>Excalidraw</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </q-btn-dropdown>
    </template>
    <q-separator vertical inset class="q-mx-xs" />
    <q-btn
      :disabled="!canUndo"
      aria-label="Undo"
      icon="sym_o_undo"
      padding="sm"
      class="q-mr-xs"
      flat
      @click="editor.dispatchCommand(UNDO_COMMAND, undefined)"
    />
    <q-btn
      :disabled="!canRedo"
      aria-label="Redo"
      icon="sym_o_redo"
      padding="sm"
      flat
      @click="editor.dispatchCommand(REDO_COMMAND, undefined)"
    />
    <q-btn
      aria-label="Debug"
      icon="sym_o_bug_report"
      padding="sm"
      flat
      :class="{ active: showDebug }"
      @click="showDebug = !showDebug"
    />
  </q-toolbar>
</template>
<style scoped>
.active {
  background-color: #f0f0f0;
}
.lexical-toolbar {
  min-height: 44px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  position: absolute;
  top: -44px;
  background-color: white;
  color: black;
}
</style>
