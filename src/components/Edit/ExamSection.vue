<template>
  <q-separator />
  <transition
    mode="out-in"
    enter-active-class="fadeIn"
    leave-active-class="fadeOut"
  >
    <div
      v-if="section"
      :key="section.id"
      class="section col col-grow relative-position"
    >
      <div
        class="absolute absolute-top-right absolute-bottom-left overflow-auto"
      >
        <div class="page-width-limit q-pa-sm">
          <div class="shadow-1 bg-white">
            <div
              class="section-header row no-wrap items-center justify-between"
            >
              <q-btn
                v-if="previousSection"
                class=""
                aria-label="previous"
                flat
                color="primary"
                :to="{
                  name: 'Edit',
                  params: {
                    project: $route.params.project,
                    sectionIndex: Number($route.params.sectionIndex) - 1,
                  },
                }"
                :label="previousSection.title"
              />
              <div v-else style="width: 180px"></div>
              <q-input
                v-model="section.title"
                type="text"
                placeholder="Section title"
                class="col text-h5 text-bold text-black q-mx-md"
                input-class="text-h5 text-bold"
                dense
              >
                <template #before>
                  {{ section.number }}
                </template>
              </q-input>
              <q-btn
                v-if="nextSection"
                flat
                color="primary"
                class=""
                aria-label="next"
                :to="{
                  name: 'Edit',
                  params: {
                    project: $route.params.project,
                    sectionIndex: Number($route.params.sectionIndex) + 1,
                  },
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
                v-model="section.level"
                flat
                map-options
                options-cover
                emit-value
                dense
                placeholder="Level"
                :options="[
                  { label: 'Level 1', value: 0 },
                  { label: 'Level 2', value: 1 },
                  { label: 'Level 3', value: 2 },
                ]"
              />
              <q-checkbox
                v-model="section.isNumbered"
                :disable="section.isSectionTitleVisibleOnAMC"
                >Show number</q-checkbox
              >
              <q-checkbox
                v-model="section.isSectionTitleVisibleOnAMC"
                @update:model-value="
                  section.isSectionTitleVisibleOnAMC
                    ? (section.isNumbered = true)
                    : ''
                "
                >On answer sheet</q-checkbox
              >
              <q-checkbox v-model="section.shuffle">Shuffle</q-checkbox>
              <q-select
                v-model="section.columns"
                emit-value
                map-options
                options-cover
                dense
                placeholder="Columns"
                :options="[
                  { label: 'One column', value: 1 },
                  { label: 'Two columns', value: 2 },
                ]"
              />
              <q-checkbox v-model="section.pageBreakBefore"
                >Page break before</q-checkbox
              >
              <q-space />
              <q-btn
                aria-label="delete section"
                flat
                color="negative"
                icon="mdi-delete"
                padding="sm"
                @click="removeSection()"
              />
            </q-toolbar>

            <my-rich-text-editor
              v-model="section.content"
              class="page-width-limit q-pa-sm"
              :class="{
                empty: section.content == '' || section.content == '<p></p>',
              }"
            ></my-rich-text-editor>
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
              @click="examService.addQuestion(section)"
              >Add Question</q-btn
            >
          </q-toolbar>
        </div>
      </div>
    </div>
  </transition>
</template>

<script lang="ts">
import { defineComponent, inject, computed, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ExamEditor from '../../services/examEditor';
import MyRichTextEditor from './MyRichTextEditor.vue';
import ExamQuestion from './ExamQuestion.vue';

export default defineComponent({
  name: 'ExamSection',
  components: {
    MyRichTextEditor,
    ExamQuestion,
  },
  setup() {
    const examService = inject('examService') as ExamEditor;
    const route = useRoute();
    const router = useRouter();

    watchEffect(() => {
      if (route.name === 'Edit' && !route.params.sectionIndex) {
        router.push({
          name: 'Edit',
          params: {
            project: route.params.project,
            sectionIndex: '0',
          },
        });
      }
    });

    const section = computed(() => {
      return examService.exam.sections[Number(route.params.sectionIndex)];
    });
    const previousSection = computed(() => {
      const currentIndex = Number(route.params.sectionIndex);
      if (currentIndex > 0) {
        return examService.exam.sections[currentIndex - 1];
      }
      return undefined;
    });

    const nextSection = computed(() => {
      const currentIndex = Number(route.params.sectionIndex);
      if (currentIndex < examService.exam.sections.length - 1) {
        return examService.exam.sections[currentIndex + 1];
      }
      return undefined;
    });

    const addSection = () => {
      router.push({
        name: 'Edit',
        params: {
          project: route.params.project,
          sectionIndex: examService.addSection(examService.createSection()),
        },
      });
    };

    const removeSection = () => {
      router.push({
        name: 'Edit',
        params: {
          project: route.params.project,
          sectionIndex: examService.removeSection(section.value),
        },
      });
    };

    return {
      examService,
      section,
      previousSection,
      nextSection,
      addSection,
      removeSection,
    };
  },
});
</script>
<style scoped>
.page-width-limit {
  max-width: 1000px;
  margin: 8px auto;
}
.myrichtexteditor.page-width-limit {
  max-width: 800px;
  border: none;
  margin: 50px 100px;
  padding-bottom: 100px;
}
</style>
<style>
.myrichtexteditor.page-width-limit.empty .wysihtml5-editor {
  border: 1px solid #eee;
}
.section-header .q-field__marginal {
  color: rgba(0, 0, 0, 1);
}
@keyframes fadeOut {
  from {
    opacity: 1;
  }

  to {
    opacity: 0.1;
  }
}

.fadeOut {
  animation-name: fadeOut;
  animation-duration: 50ms;
  animation-iteration-count: 1;
}

@keyframes fadeIn {
  from {
    opacity: 0.1;
  }

  to {
    opacity: 1;
  }
}

.fadeIn {
  animation-name: fadeIn;
  animation-duration: 50ms;
  animation-iteration-count: 1;
}
</style>
