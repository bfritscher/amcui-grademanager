<template>
  <div class="answer row items-stretch q-mb-lg no-wrap">
    <div
      class="q-pa-md row items-center cursor-pointer"
      @click="examService.updateAnswer(answer, { correct: !answer.correct })"
    >
      <q-btn
        flat
        :round="!answer.correct"
        size="md"
        padding="xs"
        class="answer-toggle text-white"
        :class="answer.correct ? 'bg-green-8' : 'bg-red'"
        :icon="answer.correct ? 'sym_o_check' : 'sym_o_close'"
        :disable="isNone"
        :aria-label="answer.correct ? 'correct' : 'incorrect'"
      />
    </div>
    <div class="col-grow">
      <div v-if="isNone" class="col-grow editor-outlined custom-editor">
        <div class="lexical-editor">
          <div class="preview">None of the above</div>
        </div>
      </div>
      <LexicalEditor
        v-else
        :id="`${answer.id}_content`"
        :model-value="answer.content"
        class="custom-editor"
        @update:model-value="examService.updateAnswer(answer, { content: $event })"
      />
    </div>
    <q-btn
      color="primary"
      flat
      size="sm"
      padding="sm"
      class="q-my-sm"
      dense
      no-caps
      :label="answer.scoring || 'Pts'"
      aria-label="custom scoring"
      :disable="isNone"
      @click="openScoringDialog"
    >
    <q-tooltip>
      Custom Score
    </q-tooltip>
    </q-btn>
    <q-btn
      color="negative"
      flat
      icon="sym_o_delete_forever"
      aria-label="delete answer"
      class="q-ma-sm"
      :disable="isNone"
      @click="examService.removeAnswer(answer)"
    />
    <q-dialog v-model="scoringDialog" persistent>
      <q-card style="min-width: 300px">
        <q-card-section>
          <div class="text-h6">Custom Scoring</div>
        </q-card-section>

        <q-card-section class="q-pt-none">
          <q-input
            v-model.number="customScoring"
            type="number"
            label="Points"
            dense
            autofocus
            @keyup.enter="saveScoringAndClose"
          />
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat v-close-popup label="Cancel" />
          <q-btn flat label="Save" color="primary" @click="saveScoringAndClose" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType, ref } from 'vue';
import type { Question, Answer } from '../models';
import LexicalEditor from './lexical/LexicalEditor.vue';
import { useExamStore } from '@/stores/exam';

export default defineComponent({
  name: 'ExamAnswer',
  components: {
    LexicalEditor
  },
  props: {
    question: {
      type: Object as PropType<Question>,
      required: true
    },
    answer: {
      type: Object as PropType<Answer>,
      required: true
    },
    isNone: {
      type: Boolean,
      required: false,
      default: false
    }
  },
  setup(props) {
    const examService = useExamStore();
    const scoringDialog = ref(false);
    const customScoring = ref<string>();

    const openScoringDialog = () => {
      customScoring.value = props.answer.scoring;
      scoringDialog.value = true;
    };

    const saveScoringAndClose = () => {
      examService.updateAnswer(props.answer, { scoring: customScoring.value });
      scoringDialog.value = false;
    };

    return {
      examService,
      scoringDialog,
      customScoring,
      openScoringDialog,
      saveScoringAndClose
    };
  }
});
</script>
<style scoped>
.answer-toggle {
  transition: all linear 0.3s;
}
.custom-editor {
  min-width: 150px;
  max-width: 673px;
  margin-left: 16px;
}
</style>
