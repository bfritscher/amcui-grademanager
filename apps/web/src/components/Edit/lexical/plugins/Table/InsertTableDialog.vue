<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PropType } from 'vue';
import type { LexicalEditor } from 'lexical';

import { INSERT_TABLE_COMMAND } from '@lexical/table';
import { useDialogPluginComponent, useQuasar } from 'quasar';

const props = defineProps({
  activeEditor: {
    type: Object as PropType<LexicalEditor>,
    required: true
  }
});

defineEmits([
  // REQUIRED; need to specify some events that your
  // component will emit through useDialogPluginComponent()
  ...useDialogPluginComponent.emits
]);

const $q = useQuasar();

const { dialogRef, onDialogHide, onDialogOK } = useDialogPluginComponent();

const rows = ref(2);
const columns = ref(2);
const isDisabled = computed(() => {
  return !(
    rows.value &&
    rows.value > 0 &&
    rows.value <= 500 &&
    columns.value &&
    columns.value > 0 &&
    columns.value <= 50
  );
});

const onClick = () => {
  props.activeEditor.dispatchCommand(INSERT_TABLE_COMMAND, {
    columns: String(columns.value),
    rows: String(rows.value),
    includeHeaders: {
      columns: false,
      rows: false
    }
  });
  onDialogOK();
};
</script>
<template>
  <q-dialog ref="dialogRef" :maximized="$q.screen.lt.sm" persistent @hide="onDialogHide">
    <q-card class="q-dialog-plugin">
      <q-toolbar class="bg-primary text-white">
        <q-toolbar-title> Insert Table </q-toolbar-title>
        <q-btn flat round dense icon="sym_o_close" @click="onDialogOK" />
      </q-toolbar>
      <q-card-section>
        <q-input v-model.number="rows" placeholder="# of rows" label="Rows" type="number" />
        <q-input
          v-model.number="columns"
          placeholder="# of columns"
          label="Columns"
          type="number"
        />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="Cancel" @click="onDialogHide" />
        <q-btn flat label="Insert" :disable="isDisabled" color="primary" @click="onClick" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
