<template>
  <div class="answer row items-stretch q-mb-lg">
    <div
      class="q-pa-md row items-center cursor-pointer"
      @click="answer.correct = !answer.correct"
    >
      <q-btn
        flat
        :round="!answer.correct"
        size="md"
        padding="xs"
        class="answer-toggle text-white"
        :class="answer.correct ? 'bg-green-8' : 'bg-red'"
        :icon="answer.correct ? 'mdi-check' : 'mdi-close'"
        :disable="isNone"
      />
    </div>
    <div v-if="isNone" class="col-grow myrichtexteditor">
      <div class="preview">None of the above</div>
    </div>
    <my-rich-text-editor
      v-else
      v-model="answer.content"
      class="col-grow q-pa-sm"
    ></my-rich-text-editor>
    <q-btn
      color="negative"
      flat
      icon="mdi-delete"
      aria-label="delete answer"
      class="q-ma-sm"
      :disable="isNone"
      @click="examService.removeAnswer(question, answer)"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, inject, PropType } from 'vue';
import { Question, Answer } from '../models';
import ExamEditor from '../../services/examEditor';
import MyRichTextEditor from './MyRichTextEditor.vue';

export default defineComponent({
  name: 'ExamAnswer',
  components: {
    MyRichTextEditor,
  },
  props: {
    question: {
      type: Object as PropType<Question>,
      required: true,
    },
    answer: {
      type: Object as PropType<Answer>,
      required: true,
    },
    isNone: {
      type: Boolean,
      required: false,
      default: false,
    },
  },
  setup() {
    const examService = inject('examService') as ExamEditor;

    return {
      examService,
    };
  },
});
</script>
<style scoped>
.answer-toggle {
  transition: all linear 0.3s;
}
</style>
