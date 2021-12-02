<template>
  <q-dialog
    ref="dialogRef"
    :maximized="$q.screen.lt.sm"
    persistent
    @hide="onDialogHide"
  >
    <q-card class="q-dialog-plugin code-editor">
      <q-toolbar class="bg-primary text-white">
        <q-toolbar-title> Code editing </q-toolbar-title>
        <q-btn flat round dense icon="mdi-close" @click="onDialogOK" />
      </q-toolbar>
      <q-card-section>
        <q-toolbar>
          <q-select
            v-model="code.mode"
            placeholder="Mode"
            :options="[
              'text/html',
              'text/css',
              'text/javascript',
              'text/x-sql',
              'text/x-java',
              'text/x-python',
            ]"
            dense
          />
          <q-checkbox v-model="code.numbers">Line numbers</q-checkbox>
          <q-checkbox v-model="code.border">Border</q-checkbox>
        </q-toolbar>
        <div
          :class="{ border: code.border }"
          class="column scroll"
          style="max-height: 70vh; min-height: 50vh"
        >
          <codemirror
            v-if="showCode"
            :model-value="code.content"
            :options="options"
            @update:model-value="onCodeChange"
          />
        </div>
      </q-card-section>
      <q-card-actions align="right">
        <q-space />
        <q-btn color="primary" flat label="close" @click="onDialogOK" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { useDialogPluginComponent } from 'quasar';
import { defineComponent, inject, computed, PropType, onMounted, ref, watchEffect } from 'vue';
import ExamEditor from '../../services/examEditor';
import Codemirror from '../Codemirror.vue';
import { Code } from '../models';

export default defineComponent({
  name: 'CodeEditorDialog',
  components: {
    Codemirror,
  },
  props: {
    codeId: {
      type: String as PropType<string>,
      required: true,
    },
  },
  emits: [
    // REQUIRED; need to specify some events that your
    // component will emit through useDialogPluginComponent()
    ...useDialogPluginComponent.emits,
  ],

  setup(props) {
    // REQUIRED; must be called inside of setup()
    const { dialogRef, onDialogHide, onDialogOK } = useDialogPluginComponent();
    // dialogRef      - Vue ref to be applied to QDialog
    // onDialogHide   - Function to be used as handler for @hide on QDialog
    // onDialogOK     - Function to call to settle dialog with "ok" outcome
    //                    example: onDialogOK() - no payload
    //                    example: onDialogOK({ /*.../* }) - with payload
    // onDialogCancel - Function to call to settle dialog with "cancel" outcome
    const examService = inject('examService') as ExamEditor;

    const showCode = ref(false);
    const localCode = ref('');

    const code = computed(() => {
      return examService.getCode(props.codeId, true) as Code;
    });

    watchEffect(() => {
      localCode.value = code.value.content;
    });

    const options = computed(() => {
      return {
        mode: code.value.mode,
        lineNumbers: code.value.numbers,
        viewportMargin: Infinity,
        matchBrackets: true,
        autoCloseBrackets: true,
        autoCloseTags: true,
        matchTags: { bothTags: true },
      };
    });

    onMounted(() => {
      window.setTimeout(() => {
        showCode.value= true;
      }, 500);
    });

    return {
      showCode,
      localCode,
      code,
      dialogRef,
      onDialogHide(){
        code.value.content = localCode.value;
        onDialogHide();
      },
      onCodeChange(newValue: string) {
        localCode.value = newValue;
      },
      onDialogOK,
      options,
    };
  },
});
</script>
<style scoped>
 .code-editor .border {
  border: 1px solid #000;
}
</style>
<style>
.q-dialog__inner--minimized .q-card.q-dialog-plugin.code-editor {
  min-width: 80vh;
}
@media (min-width: 992px) {
  .q-dialog__inner--minimized .q-card.q-dialog-plugin.code-editor {
    max-width: 60vh;
  }
}
</style>
