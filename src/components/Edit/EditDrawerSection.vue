<template>
  <li
    class="section-menu q-py-sm q-px-sm"
    :class="{ 'bg-grey-3': section == currentSection }"
  >
    <router-link
      :to="examService.linkToQuestion(section)"
      class="row items-center text-subtitle1 text-bold text-black"
    >
      <q-checkbox
        v-if="examService.copy.enabled"
        :model-value="examService.copy.selected.has(section.id)"
        dense
        @update:model-value="examService.toggleCopy(section)"
        >{{ section.number }} {{ section.title }}</q-checkbox
      >
      <div v-else>{{ section.number }} {{ section.title }}</div>
      <q-space />
      <q-icon name="mdi-cursor-move" class="text-grey-7" size="sm" />
    </router-link>
    <draggable
      v-model="section.questions"
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
import { defineComponent, PropType, computed, inject } from 'vue';
import { useRoute } from 'vue-router';
import { Section } from '../models';
import draggable from 'vuedraggable';
import EditDrawerQuestion from './EditDrawerQuestion.vue';
import ExamEditor from '../../services/examEditor';

export default defineComponent({
  name: 'EditDrawerSection',
  components: {
    draggable,
    EditDrawerQuestion,
  },
  props: {
    section: {
      type: Object as PropType<Section>,
      required: true,
    },
  },
  setup() {
    const examService = inject('examService') as ExamEditor;
    const route = useRoute();
    const currentSection = computed(() => {
      return examService.exam.sections[Number(route.params.sectionIndex)];
    });
    return {
      currentSection,
    };
  },
});
</script>
<style scoped>
.section-menu .mdi-cursor-move.q-icon {
  cursor: move;
}
.section-menu a {
  text-decoration: none;
}
</style>
