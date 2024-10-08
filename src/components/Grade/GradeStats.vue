<template>
  <q-toolbar class="bg-secondary shadow-1">
    <q-select
      v-model="sortBy"
      :options="sortItems"
      map-options
      emit-value
      borderless
      style="width: 200px"
      label-color="primary"
      color="primary"
      label="Sort by"
    ></q-select>
    <q-btn flat aria-label="catalog" color="primary" @click="downloadCatalog()"
      >Download&nbsp;<small>Catalog.pdf</small></q-btn
    >
    <q-checkbox v-model="showLetters" label="Show letters" size="sm" />
  </q-toolbar>
  <div class="row">
    <div v-for="row in sortedStats" :key="row.title" class="question-stat">
      <div class="text-h5 text-bold">{{ row.title }}</div>
      <div
        v-if="questionsLookup.hasOwnProperty(row.title)"
        class="q-my-sm bg-grey-11 q-pa-sm text-body2"
      >
        {{ filterTags(questionsLookup[row.title].content) }}
      </div>
      <div>
        Total: <b>{{ row.total }}</b> Mean:
        <b>{{ (row.avg * 100).toFixed(2) }}%</b>
      </div>
      <div class="answer-dist">
        <div
          v-for="(a, index) in sortedAnswers(row.answers)"
          :key="index"
          :style="{ width: (a.nb / row.total) * 100 + '%' }"
          class="answer-stat"
          :class="correctToColor(a.correct)"
          :title="
            questionsLookup.hasOwnProperty(row.title) &&
            questionsLookup[row.title].answers.length > a.answer
              ? filterTags(questionsLookup[row.title].answers[a.answer].content)
              : ''
          "
        >
          <span class="answer-letter">{{ toLetter(a.answer, row.answers.length - 2) }}</span>
          <span class="answer-count">({{ a.nb }})</span>
          <span class="answer-percent">{{ ((a.nb / row.total) * 100).toFixed(2) }}%</span>
          <span
            v-if="
              questionsLookup.hasOwnProperty(row.title) &&
              questionsLookup[row.title].answers.length > a.answer
            "
            class="answer-answer text-caption"
          >
            {{ filterTags(questionsLookup[row.title].answers[a.answer].content) }}</span
          >
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { useApiStore } from '@/stores/api';
import type { Question, Stat } from '../models';
import { computed, ref } from 'vue';
import { useExamStore } from '@/stores/exam';

const props = defineProps({
  stats: {
    type: Array<Stat>,
    required: true
  }
});

const examService = useExamStore();
const API = useApiStore();
const sortBy = ref('title');
const showLetters = ref(true);
const sortItems = ref([
  {
    value: 'title',
    label: 'Question'
  },
  {
    value: 'avg',
    label: 'Mean'
  }
]);

const sortedStats = computed(() => {
  const items = props.stats.slice(0);
  items.sort((a: any, b: any) => {
    if (typeof a[sortBy.value] === 'string') {
      return a[sortBy.value].localeCompare(b[sortBy.value]);
    }
    return a[sortBy.value] - b[sortBy.value];
  });
  return items;
});

const questionsLookup = computed(() => {
  return examService.exam.sections.reduce(
    (lookup, section) => {
      section.questions.forEach((question) => {
        const fixedQuestion = Object.assign({}, question);
        fixedQuestion.answers = [
          { content: 'None of the above', id: '0', correct: false },
          ...fixedQuestion.answers
        ];

        lookup[`Q${('00' + question.number).slice(-2)}`] = fixedQuestion;
      });
      return lookup;
    },
    {} as { [key: string]: Question }
  );
});

function downloadCatalog() {
  window.open(API.getStaticFileURL('catalog.pdf'));
}

function correctToColor(correct: number) {
  if (correct === 0) {
    return 'bg-warning';
  }
  if (correct === 1) {
    return 'bg-positive';
  }
  if (correct === 2) {
    return 'bg-yellow';
  }
  if (correct === 3) {
    return 'bg-negative';
  }
}

function toLetter(index: number | string, max: number) {
  if (!showLetters.value) {
    return index;
  }
  if (index === 0) {
    index = max;
  }
  if (Number(index) > 0) {
    return String.fromCharCode(64 + Number(index));
  }
  return index;
}

function sortedAnswers(answers: any[]) {
  if (answers[0].answer === 0) {
    answers.splice(answers.length - 3, 0, answers.shift());
  }
  return answers;
}

function filterTags(html: string) {
  return html.replace(/<([^>]+)>/gi, '').replace(/&nbsp;/gi, ' ');
}
</script>
<style scoped>
.question-stat {
  width: 320px;
  margin: 16px;
  overflow: hidden;
}

.answer-stat {
  white-space: nowrap;
  padding-left: 4px;
  position: relative;
}

.answer-stat:hover:before {
  content: ' ';
  top: 0;
  height: 24px;
  position: absolute;
  width: 320px;
  background-color: rgba(180, 180, 180, 0.2) !important;
}

.answer-letter {
  font-weight: bold;
  padding: 0 4px;
  width: 40px;
  display: inline-block;
}

.answer-count {
  text-align: right;
  width: 40px;
  display: inline-block;
}

.answer-percent {
  text-align: right;
  width: 80px;
  display: inline-block;
}
.answer-answer {
  padding: 0 16px;
}
</style>
