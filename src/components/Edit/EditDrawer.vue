<template>
  <div class="column no-wrap fit">
    <q-toolbar class="bg-secondary">
      <q-toolbar-title class="text-grey-8">Navigation</q-toolbar-title>
      <!-- TODO-nice on small device move main button (print, ...) to here? -->
    </q-toolbar>
    <q-separator />
    <div class="edit-drawer-tree col scroll q-py-sm">
      <template v-if="examService.exam.sections.length === 0">
        <q-skeleton  type="text" />
        <q-skeleton  type="text" />
        <q-skeleton  type="text"/>
      </template>
      <draggable
        v-model="examService.exam.sections"
        group="section"
        tag="ol"
        item-key="id"
        handle=".q-icon"
        :force-fallback="true"
      >
        <template #item="{ element }">
          <edit-drawer-section :section="element" />
        </template>
      </draggable>
    </div>

    <q-separator/>
    <div class="q-px-md q-py-sm bg-secondary">
      <q-toggle
        v-model="examService.copy.enabled"
        label="Activate copy"
        dense
        @update:model-value="API.getProjectList()"
      />
      <div v-if="examService.copy.enabled">
        <p>
          {{ copySummary.questions }} question(s) in
          {{ copySummary.sections }} section(s).
        </p>
        <q-select
          v-model="ui.copyToName"
          use-input
          input-debounce="0"
          options-dense
          label="CopyTo"
          :options="ui.copyOptions"
          @filter="copyFilterFn"
        >
          <template #after>
            <q-btn
              label="Copy"
              color="primary"
              unelevated
              :disable="copySummary.sections == 0 || !ui.copyToName"
              @click="examService.copyTo(ui.copyToName)"
            />
          </template>
        </q-select>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, reactive, inject } from 'vue';
import draggable from 'vuedraggable';
import ExamEditor from '../../services/examEditor';
import { useStore } from '../../store';
import htmlToPlaintext from '../../utils/htmlToPlainText';
import EditDrawerSection from './EditDrawerSection.vue';

export default defineComponent({
  name: 'EditDrawer',
  components: {
    draggable,
    EditDrawerSection,
  },
  setup() {
    const examService = inject('examService') as ExamEditor;
    const store = useStore();
    const ui = reactive({
      copyToName: '',
      copyOptions: [] as string[],
    });
    const copySummary = computed(() => {
      const sectionsCount = Object.keys(examService.copy.data).length;
      return {
        sections: sectionsCount,
        questions: examService.copy.selected.size - sectionsCount,
      };
    });

    return {
      ui,
      htmlToPlaintext,
      copySummary,
      copyFilterFn(val: string, update: any) {
        if (val === '') {
          update(() => {
            ui.copyOptions = store.state.projects.map((p) => p.project);
          });
          return;
        }

        update(() => {
          const needle = val.toLowerCase();
          ui.copyOptions = store.state.projects
            .map((p) => p.project)
            .filter((v) => v.toLowerCase().indexOf(needle) > -1);
        });
      },
    };
  },
});
</script>
<style>
.edit-drawer-tree {
  overflow-x: hidden;
}

.edit-drawer-tree ol {
  list-style: none;
  margin: 0;
  padding: 0;
}
.edit-drawer-tree ol ol {
  padding-left: 20px;
}

.sortable-ghost {
  background: #f0f9ff;
  border: 2px dashed #bed2db;
  color: #f0f9ff;
}
.sortable-drag {
  background-color: white;
}
</style>
