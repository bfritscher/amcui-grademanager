<template>
  <li
    class="question-menu q-mb-xs"
    :class="{ active: examService.currentQuestion?.id === question.id }"
  >
    <router-link
      :to="examService.linkToQuestion(section, question)"
      class="row no-wrap items-center text-subtitle1 text-bold text-black"
    >
      <div class="column question-menu-description col no-wrap relative-position">
        <strong class="col">
          <q-checkbox
            v-if="examService.copy.enabled"
            :model-value="examService.copy.selected.has(question.id)"
            dense
            @update:model-value="examService.toggleCopy(section, question)"
          >
            <q-icon v-if="!question.isValid" name="sym_o_warning" color="warning"></q-icon>
            Question {{ question.number }}
            <span v-if="question.type === 'MULTIPLE'">♣</span>
          </q-checkbox>
          <div v-else>
            <q-icon v-if="!question.isValid" name="sym_o_warning" color="warning"></q-icon>
            Question {{ question.number }}
            <span v-if="question.type === 'MULTIPLE'">♣</span>
            <span
              v-if="question.type !== 'OPEN' && question.answers && question.answers.length > 0"
              title="number of answers"
              class="question-answer-nb"
              >&nbsp;({{
                question.type === 'MULTIPLE'
                  ? question.answers.length + 1
                  : question.answers.length
              }})</span
            >
            <awareness-indicator :id="question.id" />
          </div>
        </strong>
        <span class="col text-subtitle2">{{ htmlToPlaintext(question.content).slice(0, 80) }}</span>
      </div>
      <q-icon class="col-auto text-grey-5" name="sym_o_drag_pan" size="sm"></q-icon>
    </router-link>
  </li>
</template>
<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { Section, Question } from '../models';
import htmlToPlaintext from '../../utils/htmlToPlainText';
import { useExamStore } from '@/stores/exam';
import AwarenessIndicator from '@/components/AwarenessIndicator.vue';

export default defineComponent({
  name: 'EditDrawerQuestion',
  components: {
    AwarenessIndicator
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
  setup() {
    const examService = useExamStore();
    return {
      examService,
      htmlToPlaintext
    };
  }
});
</script>
<style scoped>
.question-menu .text-subtitle2 {
  font-weight: 400;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.question-menu.active,
.question-menu.active a {
  color: #283593 !important;
}

.question-menu .sym_o_drag_pan.q-icon {
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
