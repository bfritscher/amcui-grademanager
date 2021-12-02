<template>
  <div>
    <div v-if="searchResults.length > 0" class="search-result">
      <div v-for="(r, index) in searchResults" :key="index">
        <div v-for="(obj1, s) in r.chain" :key="s">
          <b
            >{{ examService.exam.sections[s].number }}
            {{ examService.exam.sections[s].title }}</b
          >
          <span v-if="obj1.title"
            ><b>: </b
            ><router-link
              class="text-primary"
              :to="examService.linkToQuestion(examService.exam.sections[s])"
              >{{ highlightSearch(obj1.title) }}</router-link
            ></span
          >
          <span v-if="obj1.content"
            ><b>: </b
            ><router-link
              class="text-primary"
              :to="examService.linkToQuestion(examService.exam.sections[s])"
              >{{ highlightSearch(obj1.content) }}</router-link
            ></span
          >
          <span v-for="(obj2, q) in obj1.questions" :key="q">
            <b
              >> Question
              {{ examService.exam.sections[s].questions[q].number }}</b
            >
            <span v-if="obj2.content"
              ><b>: </b
              ><router-link
                class="text-primary"
                :to="
                  examService.linkToQuestion(
                    examService.exam.sections[s],
                    examService.exam.sections[s].questions[q]
                  )
                "
                >{{ highlightSearch(obj2.content) }}</router-link
              ></span
            >
            <span v-for="(obj3, a) in obj2.answers" :key="a"
              ><b>> Answer: </b>
              <router-link
                class="text-primary"
                :to="
                  examService.linkToQuestion(
                    examService.exam.sections[s],
                    examService.exam.sections[s].questions[q]
                  )
                "
                >{{ highlightSearch(obj3.content) }}</router-link
              ></span
            >
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent, watchEffect, inject, ref } from 'vue';
import ExamEditor from '../../services/examEditor';
import JSONsearch from 'JSONsearch';
import htmlToPlaintext from '../../utils/htmlToPlainText';

export default defineComponent({
  name: 'ExamSearchResult',
  props: {
    query: {
      type: String,
      required: false,
      default: '',
    },
  },
  emits: ['results'],
  setup(props, { emit }) {
    const examService = inject('examService') as ExamEditor;
    const searchResults = ref<any[]>([]);

    function highlightSearch(text: string): string {
      const wordLength = props.query.length;
      if (wordLength < 3) {
        return '';
      }
      const re = new RegExp(props.query, 'i');
      let ch = text.search(re);
      const margin = 10;
      let result = '';
      if (ch > margin) {
        result += '...';
      }
      while (ch > -1) {
        result +=
          text.substr(
            Math.max(0, ch - margin),
            Math.min(wordLength + 2 * margin, text.length)
          ) + '...';
        text = text.slice(ch + props.query.length);
        ch = text.search(re);
      }
      return htmlToPlaintext(result);
    }

    function search() {
      let results = [] as any[];
      if (props.query && props.query.length >= 3) {
        try {
          results = JSONsearch(
            examService.exam.sections,
            new RegExp(props.query, 'i')
          );
          const keys = [] as any[];
          results = results.filter((item: any) => {
            if (item.inKey) {
              return false;
            }
            const key = JSON.stringify(item.chain);
            if (keys.indexOf(key) < 0) {
              keys.push(key);
              return true;
            }
            return false;
          });
        } catch (e) {
          console.log(e);
        }
      }
      searchResults.value = results;
      emit('results', results);
    }

    watchEffect(search);
    return {
      examService,
      searchResults,
      highlightSearch,
    };
  },
});
</script>
