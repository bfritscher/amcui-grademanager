<template>
  <q-separator />
  <transition mode="out-in" enter-active-class="fadeIn" leave-active-class="fadeOut">
    <div v-if="section" :key="section.id" class="section col col-grow relative-position">
      <div class="absolute absolute-top-right absolute-bottom-left overflow-auto">
        <div class="page-width-limit q-pa-sm">
          <div class="shadow-1 bg-white q-pb-sm q-mb-lg">
            <div class="section-header row no-wrap items-center justify-between q-pa-xs">
              <q-btn
                v-if="previousSection"
                class=""
                aria-label="previous"
                flat
                color="primary"
                :to="{
                  name: 'Edit',
                  params: {
                    project: route.params.project,
                    sectionIndex: Number(route.params.sectionIndex) - 1
                  }
                }"
                :label="previousSection.title"
              />
              <div v-else style="width: 180px"></div>
              <awareness-q-input
                :id="`${section.id}_title`"
                :model-value="section.title"
                type="text"
                placeholder="Section Name"
                class="col text-h5 text-bold text-black q-mx-md"
                input-class="text-h5 text-bold"
                dense
                debounce="500"
                @update:model-value="examStore.updateSection(section, { title: $event })"
              >
                <template #before>
                  {{ section.number }}
                </template>
              </awareness-q-input>
              <q-btn
                v-if="nextSection"
                flat
                color="primary"
                class=""
                aria-label="next"
                :to="{
                  name: 'Edit',
                  params: {
                    project: route.params.project,
                    sectionIndex: Number(route.params.sectionIndex) + 1
                  }
                }"
                :label="nextSection.title"
              />
              <q-btn
                v-else
                flat
                class=""
                color="primary"
                aria-label="add section"
                label="Add Section"
                @click="addSection()"
              />
            </div>
            <q-toolbar class="section-options bg-secondary row gutter scroll no-wrap">
              <q-select
                :model-value="section.level"
                flat
                map-options
                options-cover
                emit-value
                dense
                placeholder="Level"
                :options="[
                  { label: 'Level 1', value: 0 },
                  { label: 'Level 2', value: 1 },
                  { label: 'Level 3', value: 2 }
                ]"
                @update:model-value="examStore.updateSection(section, { level: $event })"
              />
              <q-checkbox
                :model-value="section.isNumbered"
                :disable="section.isSectionTitleVisibleOnAMC"
                @update:model-value="examStore.updateSection(section, { isNumbered: $event })"
                >Show number</q-checkbox
              >
              <q-checkbox
                :model-value="section.isSectionTitleVisibleOnAMC"
                @update:model-value="
                  examStore.updateSection(section, {
                    isSectionTitleVisibleOnAMC: $event,
                    isNumbered: $event ? true : section.isNumbered
                  })
                "
                >On answer sheet</q-checkbox
              >
              <q-checkbox
                :model-value="section.shuffle"
                @update:model-value="examStore.updateSection(section, { shuffle: $event })"
                >Shuffle</q-checkbox
              >
              <q-select
                :model-value="section.columns"
                emit-value
                map-options
                options-cover
                dense
                placeholder="Columns"
                :options="[
                  { label: 'One column', value: 1 },
                  { label: 'Two columns', value: 2 }
                ]"
                @update:model-value="examStore.updateSection(section, { columns: $event })"
              />
              <q-checkbox
                :model-value="section.pageBreakBefore"
                @update:model-value="examStore.updateSection(section, { pageBreakBefore: $event })"
                >Page break before</q-checkbox
              >
              <q-space />
              <q-btn
                aria-label="delete section"
                flat
                color="negative"
                icon="sym_o_delete_forever"
                padding="sm"
                @click="removeSection()"
              />
            </q-toolbar>
            <LexicalEditor
              :id="`${section.id}_content`"
              :model-value="section.content"
              class="editor-custom"
              @update:model-value="examStore.updateSection(section, { content: $event })"
            />
          </div>

          <div :class="{ 'two-columns': section.columns == 2 }">
            <exam-question
              v-for="question in section.questions"
              :key="question.id"
              :section="section"
              :question="question"
            ></exam-question>
          </div>

          <q-toolbar class="bg-secondary shadow-1 q-mt-lg q-mb-xl">
            <q-btn
              aria-label="add new question"
              flat
              color="primary"
              @click="examStore.addQuestion(section)"
              >Add Question</q-btn
            >
            <q-space />
            <q-btn
              aria-label="import questions"
              flat
              color="primary"
              @click="showImportDialog"
              >Import Questions</q-btn
            >
          </q-toolbar>
        </div>
      </div>
    </div>
  </transition>
</template>

<script lang="ts">
import { defineComponent, computed, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import ExamQuestion from './ExamQuestion.vue';
import AwarenessQInput from '@/components/AwarenessQInput.vue';
import LexicalEditor from './lexical/LexicalEditor.vue';
import ExamImportDialog from './ExamImportDialog.vue';
import { useExamStore } from '@/stores/exam';
import type { Question } from '@/components/models';

export default defineComponent({
  name: 'ExamSection',
  components: {
    ExamQuestion,
    LexicalEditor,
    AwarenessQInput
  },
  setup() {
    const examStore = useExamStore();
    const route = useRoute();
    const router = useRouter();
    const $q = useQuasar();

    watchEffect(() => {
      if (route.name === 'Edit' && !route.params.sectionIndex) {
        router.push({
          name: 'Edit',
          params: {
            project: route.params.project,
            sectionIndex: '0'
          }
        });
      }
      if (
        route.name === 'Edit' &&
        Number(route.params.sectionIndex) >= examStore.exam.sections.length
      ) {
        router.push({
          name: 'Edit',
          params: {
            project: route.params.project,
            sectionIndex: Math.max(0, examStore.exam.sections.length - 1)
          }
        });
      }
    });

    const section = computed(() => {
      return examStore.exam.sections[Number(route.params.sectionIndex)];
    });
    const previousSection = computed(() => {
      const currentIndex = Number(route.params.sectionIndex);
      if (currentIndex > 0) {
        return examStore.exam.sections[currentIndex - 1];
      }
      return undefined;
    });

    const nextSection = computed(() => {
      const currentIndex = Number(route.params.sectionIndex);
      if (currentIndex < examStore.exam.sections.length - 1) {
        return examStore.exam.sections[currentIndex + 1];
      }
      return undefined;
    });

    const addSection = () => {
      router.push({
        name: 'Edit',
        params: {
          project: route.params.project,
          sectionIndex: examStore.addSection(examStore.createSection())
        }
      });
    };

    const removeSection = () => {
      router.push({
        name: 'Edit',
        params: {
          project: route.params.project,
          sectionIndex: examStore.removeSection(section.value)
        }
      });
    };

    const showImportDialog = () => {
      $q.dialog({
        component: ExamImportDialog
      }).onOk((questions: Partial<Question>[]) => {
        examStore.importPartialQuestions(section.value, questions);
      });
    };

    return {
      route,
      examStore,
      section,
      previousSection,
      nextSection,
      addSection,
      removeSection,
      showImportDialog
    };
  }
});
</script>
<style scoped>
.page-width-limit {
  max-width: 910px;
  margin: 8px auto;
}

.section {
  background-color: #c2c2c2;
}
.editor-custom {
  max-width: 733px;
  margin: 48px auto 48px auto;
}
</style>
<style>
.lexical-editor .preview.empty {
  border: 1px solid #eee;
  min-height: 2em;
  cursor: pointer;
}
.section-header .q-field__marginal {
  color: rgba(0, 0, 0, 1);
}
@keyframes fadeOut {
  from {
    opacity: 1;
  }

  to {
    opacity: 0.5;
  }
}

.fadeOut {
  animation-name: fadeOut;
  animation-duration: 20ms;
  animation-iteration-count: 1;
}

@keyframes fadeIn {
  from {
    opacity: 0.5;
  }

  to {
    opacity: 1;
  }
}

.fadeIn {
  animation-name: fadeIn;
  animation-duration: 20ms;
  animation-iteration-count: 1;
}
</style>
