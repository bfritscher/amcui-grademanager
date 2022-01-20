<template>
  <li
    class="question-menu q-mb-xs"
    :class="{ active: examService.currentQuestion === question }"
  >
    <router-link
      :to="examService.linkToQuestion(section, question)"
      class="row no-wrap items-center text-subtitle1 text-bold text-black"
    >
      <div class="column question-menu-description col no-wrap">
        <strong class="col">
          <q-checkbox
            v-if="examService.copy.enabled"
            :model-value="examService.copy.selected.has(question.id)"
            dense
            @update:model-value="examService.toggleCopy(section, question)"
          >
            <q-icon
              v-if="!question.isValid"
              name="mdi-alert"
              color="warning"
            ></q-icon>
            Question {{ question.number }}
            <span v-if="question.type === 'MULTIPLE'">♣</span>
          </q-checkbox>
          <div v-else>
            <q-icon
              v-if="!question.isValid"
              name="mdi-alert"
              color="warning"
            ></q-icon>
            Question {{ question.number }}
            <span v-if="question.type === 'MULTIPLE'">♣</span>
            <span
              v-if="question.answers && question.answers.length > 0"
              title="number of answers"
              class="question-answer-nb"
              >&nbsp;({{
                question.type === 'MULTIPLE'
                  ? question.answers.length + 1
                  : question.answers.length
              }})</span
            >
          </div>
        </strong>
        <em class="col text-subtitle2">{{
          htmlToPlaintext(question.content).slice(0, 80)
        }}</em>
      </div>
      <q-icon
        class="col-auto text-grey-7"
        name="mdi-cursor-move"
        size="sm"
      ></q-icon>
    </router-link>
  </li>
</template>
<script lang="ts">
import { defineComponent, PropType } from 'vue';
import { Section, Question } from '../models';
import htmlToPlaintext from '../../utils/htmlToPlainText';

export default defineComponent({
  name: 'EditDrawerQuestion',
  props: {
    section: {
      type: Object as PropType<Section>,
      required: true,
    },
    question: {
      type: Object as PropType<Question>,
      required: true,
    },
  },
  setup() {
    return {
      htmlToPlaintext,
    };
  },
});
</script>
<style scoped>
.question-menu em {
  font-weight: 400;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.question-menu.active,
.question-menu.active a {
  color: #283593 !important;
}

.question-menu .mdi-cursor-move.q-icon {
  cursor: move;
}
.question-menu a {
  text-decoration: none;
}
.question-answer-nb {
  font-weight: normal;
  font-size: 80%;
  vertical-align: top;
}
</style>
