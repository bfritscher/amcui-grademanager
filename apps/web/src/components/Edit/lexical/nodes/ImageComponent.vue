<script setup lang="ts">
import { ref, onMounted, onUnmounted, watchEffect, computed } from 'vue';
import { useLexicalComposer, useLexicalNodeSelection } from 'lexical-vue';
import { mergeRegister } from '@lexical/utils';
import ExcalidrawDialog from '@/components/Edit/ExcalidrawDialog.vue';
import { type Graphics } from '@/components/models';
import { useQuasar } from 'quasar';

import {
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_DELETE_COMMAND,
  KEY_BACKSPACE_COMMAND,
  $getNodeByKey,
  $isNodeSelection,
  $getSelection
} from 'lexical';
import { $isImageNode } from './ImageNode';
import { useExamStore } from '@/stores/exam';

const props = defineProps({
  nodeKey: {
    type: String,
    required: true
  },
  id: {
    type: String,
    required: true
  },
  border: {
    type: Boolean,
    default: false
  },
  width: {
    type: Number,
    default: 100
  },
  options: {
    type: String,
    default: ''
  }
});

const { nodeKey } = props;

const editor = useLexicalComposer();
const imgRef = ref(null);
const examService = useExamStore();
const $q = useQuasar();

const { isSelected, setSelected, clearSelection } = useLexicalNodeSelection(props.nodeKey);

const $onDelete = (event: KeyboardEvent) => {
  if (isSelected.value && $isNodeSelection($getSelection())) {
    event.preventDefault();
    const node = $getNodeByKey(nodeKey);
    if ($isImageNode(node)) {
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
      if (event.target === imgRef.value) {
        if (event.shiftKey) {
          setSelected(!isSelected.value);
        } else {
          clearSelection();
          setSelected(true);
        }
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

watchEffect(() => {
  const span = editor.getElementByKey(nodeKey);
  if (span) {
    span.style.width = `${props.width}%`;
  }
});

onMounted(() => {
  const unregisterCommands = registerCommands();

  // Cleanup
  onUnmounted(() => {
    unregisterCommands();
  });
});
const graphic = computed(() => {
  return examService.exam.graphics[props.id];
});
function editExcalidraw(item: Graphics) {
  $q.dialog({
    component: ExcalidrawDialog,
    componentProps: {
      graphic: item
    }
  });
}
</script>
<template>
  <div class="relative-position">
    <img
      ref="imgRef"
      :class="{ focused: isSelected, border: border, options: !!options }"
      :src="`${examService.graphicsPreviewURL(props.id)}&t=${graphic?.updatedAt}`"
    />
    <q-btn
      v-if="graphic.name.endsWith('.excalidraw')"
      class="edit-excalidraw"
      outline
      color="deep-purple-6"
      @click.stop="editExcalidraw(graphic)"
    >
      <q-icon>
        <img src="@/assets/images/excalidraw-logo.svg" />
      </q-icon>
      Edit
    </q-btn>
  </div>
</template>
<style scoped>
.edit-excalidraw {
  position: absolute;
  top: 1em;
  right: 1em;
  z-index: 1;
}
</style>
