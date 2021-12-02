<template>
  <q-toolbar class="bg-secondary shadow-1">
    <q-select
      v-model="sortBy"
      :options="sortItems"
      map-options
      emit-value
      borderless
      style="width: 200px;"
      label-color="primary"
      color="primary"
      label="Sort by"
    ></q-select>
    <q-btn flat aria-label="catalog" color="primary" @click="downloadCatalog()"
      >Download&nbsp;<small>Catalog.pdf</small></q-btn
    >
  </q-toolbar>
  <div class="row">
    <div v-for="row in sortedStats" :key="row.title" class="question-stat">
      <div class="text-h5 text-bold">{{ row.title }}</div>
      <div>
        <b>total:</b> {{ row.total }} <b>mean:</b>
        {{ (row.avg * 100).toFixed(2) }}%
      </div>
      <div class="answer-dist">
        <div
          v-for="(a, index) in row.answers"
          :key="index"
          :style="{ width: (a.nb / row.total) * 100 + '%' }"
          class="answer-stat"
          :class="`correct-${a.correct}`"
        >
          <span>{{ a.answer }} {{ a.nb }}</span
          ><span>{{ ((a.nb / row.total) * 100).toFixed(2) }}%</span>
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
  },
});
</script>
<style scoped>
.question-stat {
  width: 320px;
  margin: 16px;
}

.answer-stat {
  white-space: nowrap;
}

.correct-0 {
  background-color: orange;
}

.correct-1 {
  background-color: green;
}

.correct-2 {
  background-color: yellow;
}

.correct-3 {
  background-color: red;
}
</style>
