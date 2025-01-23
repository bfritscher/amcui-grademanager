<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card class="q-dialog-plugin" style="min-width: 600px">
      <q-card-section>
        <div class="text-h6">Import Questions</div>
      </q-card-section>

      <q-card-section class="row">
        <div class="col-6 q-pr-md">
          <q-input
            v-model="rawText"
            type="textarea"
            filled
            autogrow
            label="Paste questions and answers here"
            hint="Each question should be followed by answers marked with -, *, A), 1), etc."
            @update:model-value="parseText"
          />
        </div>
        <div class="col-6 q-pl-md">
          <div class="text-subtitle2 q-mb-sm">Preview</div>
          <div v-for="(question, index) in parsedQuestions" :key="index" class="q-mb-md">
            <div class="text-weight-bold">{{ question.content }}</div>
            <div v-for="(answer, aindex) in question.answers" :key="aindex" class="q-pl-md">
              <q-checkbox :model-value="answer.correct" dense readonly>
                {{ answer.content }}
              </q-checkbox>
            </div>
          </div>
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancel" color="primary" @click="onCancelClick" />
        <q-btn
          flat
          label="Import"
          color="primary"
          :disable="parsedQuestions.length === 0"
          @click="onOKClick"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
import { useDialogPluginComponent } from 'quasar';
import { parseQuestions } from '@/services/questionParser';
import type { Question } from '../models';

export default defineComponent({
  name: 'ExamImportDialog',
  emits: [...useDialogPluginComponent.emits],
  setup() {
    const { dialogRef, onDialogHide, onOKClick, onCancelClick } = useDialogPluginComponent();
    const rawText = ref('');
    const parsedQuestions = ref<Partial<Question>[]>([]);

    function parseText() {
      parsedQuestions.value = parseQuestions(rawText.value);
    }

    return {
      dialogRef,
      onDialogHide,
      onOKClick: () => onOKClick(parsedQuestions.value),
      onCancelClick,
      rawText,
      parsedQuestions,
      parseText
    };
  }
});
</script>
