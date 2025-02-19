<template>
  <q-dialog ref="dialogRef" persistent @hide="onDialogHide">
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
            @update:model-value="parseText"
          />
          <q-btn flat color="primary" label="Load Sample" class="q-mt-sm" @click="loadSample" />
          <q-card class="q-mt-sm text-grey-8" bordered flat>
            <q-card-section>
              <div class="text-subtitle2">Supported formats:</div>
              <div class="q-mt-sm text-body2">
                <ul class="q-mb-none q-pl-md">
                  <li>Questions can start with numbers 1), 1. or Question X</li>
                  <li>
                    Answers can use letters A), b), c., numbers 1), 2., checkboxes [x], [ ], -[x],
                    or symbols +, -, *
                  </li>
                  <li>
                    Correct answers can be marked with Answer: or Réponse: followed by the
                    letter/number at the end of all answers
                  </li>
                  <li>Multiple questions should be separated by two empty lines</li>
                </ul>
              </div>
            </q-card-section>
          </q-card>
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
        <q-btn flat label="Cancel" color="primary" @click="onDialogCancel" />
        <q-btn
          flat
          label="Import"
          color="primary"
          :disable="parsedQuestions.length === 0"
          @click="onDialogOK"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
import { useDialogPluginComponent } from 'quasar';
import { parseQuestions } from '@/services/questionParser';
import type { PartialQuestion } from '../models';

export default defineComponent({
  name: 'ExamImportDialog',
  emits: [...useDialogPluginComponent.emits],
  setup() {
    const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } = useDialogPluginComponent();
    const rawText = ref('');
    const parsedQuestions = ref<PartialQuestion[]>([]);

    const sampleText = `Some question?
A) Answer 1
B) Answer 2
C) Answer 3
Answer: B


Other Question?
1) Answer 1
2) Answer 2
3) Answer 3
Answer: 2


Another Question?
- Answer 1
+ Answer 2
+ Answer 3`;

    function loadSample() {
      rawText.value = sampleText;
      parseText();
    }

    function parseText() {
      parsedQuestions.value = parseQuestions(rawText.value);
    }

    return {
      dialogRef,
      onDialogHide,
      onDialogOK: () => onDialogOK(parsedQuestions.value),
      onDialogCancel,
      rawText,
      parsedQuestions,
      parseText,
      loadSample
    };
  }
});
</script>
