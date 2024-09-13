<template>
  <div
    v-intersection="intersectionOptions"
    class="question shadow-1 bg-white q-mb-xl"
    :class="question.type"
  >
    <div class="question-header">
      <h3 :id="`q${question.number}`" ref="qEl" class="text-h6 q-px-md q-py-sm q-ma-none">
        <q-icon v-if="!question.isValid" color="warning" name="sym_o_warning">
          <q-tooltip> Require exactly one correct answer or set to multiple. </q-tooltip>
        </q-icon>
        Question {{ question.number }}
        <span v-if="question.type == 'MULTIPLE'">♣</span>
      </h3>
    </div>
    <q-toolbar class="question-options bg-secondary row gutter scroll no-wrap">
      <q-select
        :model-value="question.type"
        options-cover
        placeholder="Type"
        dense
        :options="['SINGLE', 'MULTIPLE', 'OPEN']"
        @update:model-value="examService.updateQuestion(question, { type: $event })"
      />

      <q-select
        v-if="question.type == 'SINGLE' || question.type == 'MULTIPLE'"
        :model-value="question.layout"
        placeholder="Layout"
        dense
        :options="['VERTICAL', 'HORIZONTAL']"
        @update:model-value="examService.updateQuestion(question, { layout: $event })"
      />
      <q-checkbox
        v-if="question.type == 'SINGLE' || question.type == 'MULTIPLE'"
        :model-value="question.ordered"
        @update:model-value="examService.updateQuestion(question, { ordered: $event })"
        >Ordered</q-checkbox
      >
      <q-select
        v-if="question.type == 'SINGLE' || question.type == 'MULTIPLE'"
        :model-value="question.columns"
        placeholder="columns"
        emit-value
        map-options
        dense
        options-cover
        :options="[
          { label: '1 column', value: 1 },
          { label: '2 columns', value: 2 },
          { label: '3 columns', value: 3 }
        ]"
        @update:model-value="examService.updateQuestion(question, { columns: $event })"
      />
      <q-checkbox
        v-if="question.type == 'SINGLE' || question.type == 'MULTIPLE'"
        :model-value="question.boxedAnswers"
        @update:model-value="examService.updateQuestion(question, { boxedAnswers: $event })"
        ><q-tooltip>use AMCBoxedAnswers</q-tooltip> Boxed</q-checkbox
      >
      <awareness-q-input
        v-if="question.type == 'SINGLE' || question.type == 'MULTIPLE'"
        :id="`${question.id}_scoring`"
        :model-value="question.scoring"
        class="question-scoring"
        label="scoring"
        input-style="min-width:50px"
        dense
        @update:model-value="examService.updateQuestion(question, { scoring: $event })"
      />
      <q-btn
        v-if="question.type == 'SINGLE' || question.type == 'MULTIPLE'"
        aria-label="scoring help"
        flat
        color="primary"
        type="a"
        padding="sm"
        icon="sym_o_help"
        href="https://www.auto-multiple-choice.net/auto-multiple-choice.en/graphical-interface.shtml#bareme"
        target="_blank"
      />

      <q-checkbox
        v-if="question.type == 'OPEN'"
        :model-value="question.dots"
        aria-label="Dots"
        @update:model-value="examService.updateQuestion(question, { dots: $event })"
        >Dots</q-checkbox
      >
      <q-checkbox
        v-if="question.type == 'OPEN'"
        :model-value="question.lineup"
        @update:model-value="examService.updateQuestion(question, { lineup: $event })"
      >
        <q-tooltip>
          <div style="width: 300px">
            If checked, the answering area and the scoring boxes will be on the same line.<br />If
            unchecked (this is default), the answering area is enclosed in a frame and placed below
            the scoring boxes.<br />Used for open questions and separate answer sheet)
          </div></q-tooltip
        >Lineup</q-checkbox
      >
      <q-input
        v-if="question.type == 'OPEN'"
        :model-value="question.lines"
        type="number"
        :min="0"
        label="lines"
        dense
        @update:model-value="
          examService.updateQuestion(question, { lines: parseInt(String($event), 10) })
        "
      />
      <q-input
        v-if="question.type == 'OPEN'"
        :model-value="question.points"
        type="number"
        :min="1"
        label="Points"
        dense
        @update:model-value="
          examService.updateQuestion(question, { points: parseInt(String($event), 10) })
        "
      />
      <q-btn
        flat
        aria-label="copy question"
        icon="sym_o_content_copy"
        color="primary"
        padding="sm"
        @click="examService.copyQuestion(section, question)"
      >
        <q-tooltip>copy question</q-tooltip>
      </q-btn>
      <q-space />
      <q-btn
        icon="sym_o_delete_forever"
        flat
        color="negative"
        aria-label="delete question"
        padding="sm"
        @click="examService.removeQuestion(question)"
      >
        <q-tooltip> delete question </q-tooltip>
      </q-btn>
    </q-toolbar>
    <LexicalEditor
      :id="`${question.id}_content`"
      :model-value="question.content"
      class="custom-editor"
      @update:model-value="examService.updateQuestion(question, { content: $event })"
    />
    <div
      v-if="question.type == 'SINGLE' || question.type == 'MULTIPLE'"
      :class="question.layout === 'HORIZONTAL' ? 'row' : 'column no-wrap'"
      class="answer-box q-mt-lg"
    >
      <exam-answer
        v-for="answer in question.answers"
        :key="answer.id"
        :question="question"
        :answer="answer"
      ></exam-answer>
      <exam-answer
        v-if="question.type == 'MULTIPLE'"
        :question="question"
        :answer="{ correct: questionIsNoneCorrect, id: '', content: '' }"
        is-none
      />
    </div>
    <q-toolbar
      v-if="question.type == 'SINGLE' || question.type == 'MULTIPLE'"
      class="answer-add bg-secondary"
    >
      <q-btn
        aria-label="add new answer"
        flat
        color="primary"
        @click="examService.addAnswer(question)"
        >Add Answer</q-btn
      >
    </q-toolbar>

    <div
      v-if="question.type == 'OPEN'"
      class="answer-open-points row bg-secondary items-center justify-start q-mx-lg q-pa-xs q-mt-lg"
    >
      <template v-for="(p, index) in points" :key="index">
        <div class="circle" :class="{ last: question.points === index }"></div>
        <div class="point">{{ index }}{{ index > 1 ? 'pts' : 'pt' }}</div>
      </template>
    </div>
    <div v-if="question.type == 'OPEN'" class="q-pb-md">
      <div class="answer-open relative-position q-mb-md q-mx-lg">
        <p
          v-for="(p, index) in range(question.lines || 1)"
          :key="index"
          :class="{ dots: question.dots }"
        >
          &nbsp;
        </p>
        <div class="absolute absolute-top">
          <LexicalEditor
            :id="`${question.id}answer`"
            :model-value="question.answer || ''"
            class="q-pa-sm text-red"
            @update:model-value="examService.updateQuestion(question, { answer: $event })"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, watch, onMounted, type PropType, computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { Section, Question } from '../models';
import ExamAnswer from './ExamAnswer.vue';
import LexicalEditor from './lexical/LexicalEditor.vue';
import { useExamStore } from '@/stores/exam';
import { useApiStore } from '@/stores/api';
import AwarenessQInput from '@/components/AwarenessQInput.vue';

export default defineComponent({
  name: 'ExamQuestion',
  components: {
    LexicalEditor,
    ExamAnswer,
    AwarenessQInput
  },
  props: {
    section: {
      type: Object as PropType<Section>,
      required: true
    },
    question: {
      type: Object as PropType<Question>,
      required: true
    }
  },
  setup(props) {
    const examService = useExamStore();
    const API = useApiStore();
    const points = computed(() => {
      return new Array(1 + props.question.points);
    });
    const route = useRoute();

    const questionIsNoneCorrect = computed(() => {
      return props.question.answers.every((a) => !a.correct);
    });

    const qEl = ref();

    function scrollToViewIfHash(hash: string) {
      if (hash === `#${qEl.value.id}`) {
        setTimeout(() => {
          qEl.value.scrollIntoView({ behavior: 'smooth' });
        });
      }
    }

    onMounted(() => {
      scrollToViewIfHash(route.hash);
    });

    watch(
      () => route.hash,
      (hash) => {
        scrollToViewIfHash(hash);
      }
    );

    return {
      qEl,
      points,
      questionIsNoneCorrect,
      examService,
      intersectionOptions: {
        handler(entry: IntersectionObserverEntry | undefined): boolean {
          if (entry && entry.isIntersecting) {
            examService.currentQuestion = props.question;
            API.addAwarenessLocation(props.question.id, /(q.+[^_])/g);
          }
          return true;
        },
        cfg: {
          threshold: [0.5]
        }
      },
      range(nb: number) {
        return new Array(nb);
      }
    };
  }
});
</script>
<style scoped>
.answer-open-points {
  max-width: 723px;
  margin: 0 auto;
}
.answer-open-points div.point {
  margin: 0 4px 0 1px;
}

.answer-open-points div.circle {
  border: 1px solid #000;
  width: 16px;
  height: 16px;
  border-radius: 8px;
  background-color: #fff;
}

.answer-open-points div.circle.last {
  background-color: #000;
}

.answer-open {
  border: 2px solid #000;
  clear: both;
  max-width: 723px;
  margin: 0 auto;
}
.answer-open p {
  width: 100%;
  margin: 0;
  line-height: 42px;
}
.answer-open p.dots {
  border-bottom: 1px dashed #333;
}
.custom-editor {
  max-width: 733px;
  margin: 48px auto 48px auto;
}
</style>
