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
        >
          <span class="answer-letter">{{
            toLetter(a.answer, row.answers.length - 2)
          }}</span>
          <span class="answer-count">({{ a.nb }})</span>
          <span class="answer-percent"
            >{{ ((a.nb / row.total) * 100).toFixed(2) }}%</span
          >
        </div>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'GradeStats',
  inject: ['API'],
  props: {
    stats: {
      type: Array,
      required: true,
    },
  },
  data() {
    return {
      sortBy: 'title',
      showLetters: true,
      sortItems: [
        {
          value: 'title',
          label: 'Question',
        },
        {
          value: 'avg',
          label: 'Mean',
        },
      ],
    };
  },
  computed: {
    sortedStats() {
      const items = this.stats.slice(0);
      items.sort((a: any, b: any) => {
        if (typeof a[this.sortBy] === 'string') {
          return a[this.sortBy].localeCompare(b[this.sortBy]);
        }
        return a[this.sortBy] - b[this.sortBy];
      });
      return items;
    },
  },
  methods: {
    downloadCatalog() {
      window.open(this.API.getStaticFileURL('catalog.pdf'));
    },
    correctToColor(correct: number) {
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
    },
    toLetter(index: number | string, max: number) {
      if (!this.showLetters) {
        return index;
      }
      if (index === 0) {
        index = max;
      }
      if (Number(index) > 0) {
        return String.fromCharCode(64 + Number(index));
      }
      return index;
    },
    sortedAnswers(answers: any[]) {
      if (answers[0].answer === 0) {
        answers.splice(answers.length - 3, 0, answers.shift());
      }
      return answers;
    },
  },
});
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
</style>
