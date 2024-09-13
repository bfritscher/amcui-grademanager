<template>
  <li class="section-menu q-py-sm q-px-sm" :class="{ 'bg-grey-3': section == currentSection }">
    <router-link
      :to="examService.linkToQuestion(section)"
      class="row items-center text-subtitle1 text-bold text-black no-wrap"
    >
      <q-checkbox
        v-if="examService.copy.enabled"
        :model-value="examService.copy.selected.has(section.id)"
        dense
        @update:model-value="examService.toggleCopy(section)"
        >{{ section.number }} {{ section.title }}</q-checkbox
      >
      <div v-else class="section-title">
        {{ section.number }} {{ section.title }}
        <span
          v-if="section.questions.length > 0"
          title="number of questions"
          class="section-question-nb"
          >({{ section.questions.length }})</span
        >
      </div>
      <q-space />
      <q-icon name="sym_o_drag_pan" class="text-grey-5" size="sm" />
    </router-link>
    <draggable
      v-model="questions"
      group="question"
      tag="ol"
      item-key="id"
      handle=".q-icon"
      :force-fallback="true"
    >
      <template #item="{ element }">
        <edit-drawer-question :section="section" :question="element" />
      </template>
    </draggable>
  </li>
</template>
<script lang="ts">
import { defineComponent, type PropType, computed } from 'vue';
import { useRoute } from 'vue-router';
import type { Section } from '../models';
import draggable from 'vuedraggable';
import EditDrawerQuestion from './EditDrawerQuestion.vue';
import { useExamStore } from '@/stores/exam';

export default defineComponent({
  name: 'EditDrawerSection',
  components: {
    draggable,
    EditDrawerQuestion
  },
  props: {
    section: {
      type: Object as PropType<Section>,
      required: true
    }
  },
  setup(props) {
    const examService = useExamStore();
    const route = useRoute();
    const currentSection = computed(() => {
      return examService.exam.sections[Number(route.params.sectionIndex)];
    });

    const questions = computed({
      get: () => props.section.questions,
      set: (val) => {
        examService.updateQuestionsOrder(props.section, val);
      }
    });

    return {
      questions,
      examService,
      currentSection
    };
  }
});
</script>
<style scoped>
.section-menu .sym_o_drag_pan.q-icon {
  cursor: move;
}
.section-menu a {
  text-decoration: none;
}
.section-question-nb {
  font-weight: normal;
  font-size: 80%;
  vertical-align: top;
}
.section-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
