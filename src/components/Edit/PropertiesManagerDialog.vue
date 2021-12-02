<template>
  <q-dialog ref="dialogRef" :maximized="$q.screen.lt.sm" @hide="onDialogHide">
    <q-card class="q-dialog-plugin">
      <q-toolbar class="bg-primary text-white">
        <q-toolbar-title> Document Properties </q-toolbar-title>
        <q-btn flat round dense icon="mdi-close" @click="onDialogOK" />
      </q-toolbar>
      <div class="column scroll">
        <q-card-section>
          <div v-for="key in properties" :key="key">
            <q-input v-model="examService.exam.properties[key]" :label="key">
              <template #after>
                <q-btn
                  color="negative"
                  flat
                  icon="mdi-delete"
                  @click="removeProperty(key)"
                />
              </template>
            </q-input>
          </div>
        </q-card-section>
      </div>
      <q-separator />
      <q-card-actions align="right" class="row no-wrap">
        <span
          >Display any <code>\AMCUI<i>property_name</i></code> from source.tex
          in latex options.</span
        >
        <q-space />
        <q-btn color="primary" flat label="close" @click="onDialogOK" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { useDialogPluginComponent } from 'quasar';
import { defineComponent, inject, computed } from 'vue';
import ExamEditor from '../../services/examEditor';
export default defineComponent({
  emits: [
    // REQUIRED; need to specify some events that your
    // component will emit through useDialogPluginComponent()
    ...useDialogPluginComponent.emits,
  ],

  setup() {
    // REQUIRED; must be called inside of setup()
    const { dialogRef, onDialogHide, onDialogOK } = useDialogPluginComponent();
    // dialogRef      - Vue ref to be applied to QDialog
    // onDialogHide   - Function to be used as handler for @hide on QDialog
    // onDialogOK     - Function to call to settle dialog with "ok" outcome
    //                    example: onDialogOK() - no payload
    //                    example: onDialogOK({ /*.../* }) - with payload
    // onDialogCancel - Function to call to settle dialog with "cancel" outcome
    const examService = inject('examService') as ExamEditor;

    const properties = computed(() => {
      const keys = Object.keys(examService.exam.properties);
      keys.sort();
      return keys;
    });
    return {
      dialogRef,
      onDialogHide,
      onDialogOK,
      properties,
      examService,
      removeProperty(key: string) {
        delete examService.exam.properties[key];
      },
    };
  },
});
</script>
