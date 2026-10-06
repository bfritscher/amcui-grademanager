<template>
  <!-- eslint-disable vue/no-v-html -->
  <!-- Archived HTML is sanitized by safeHtml before rendering. -->
  <q-page padding>
    <q-banner class="bg-grey-2 q-mb-md">{{ project }} · Archived — read-only</q-banner>
    <q-banner v-if="archive?.cleanupPending" class="bg-yellow-1 q-mb-md"
      >Final documents are available. Cleanup is unfinished; an administrator can check or retry the
      job. Copying will be available when cleanup completes.</q-banner
    >
    <q-banner v-if="error" class="bg-red-1 text-negative q-mb-md">{{ error }}</q-banner>
    <q-spinner v-if="loading" />
    <template v-if="archive">
      <div class="row items-center q-gutter-sm q-mb-md">
        <span>Archived {{ new Date(archive.manifest.archivedAt).toLocaleDateString() }}</span
        ><q-space /><q-btn
          outline
          label="Copy project"
          :disable="archive.cleanupPending"
          @click="copyProject"
        />
      </div>
      <q-tabs v-model="tab" align="left"
        ><q-tab name="questions" label="Questions" /><q-tab
          name="documents"
          label="Documents" /><q-tab name="grades" label="Grades"
      /></q-tabs>
      <q-tab-panels v-model="tab">
        <q-tab-panel name="questions">
          <div class="row q-gutter-md items-center q-mb-md">
            <q-input v-model="searchQuestions" outlined dense label="Find questions" /><q-btn
              label="Copy selected questions"
              color="primary"
              :disable="!selected.length || archive.cleanupPending"
              @click="openCopy"
            />
          </div>
          <div v-for="section in archive.exam.sections" :key="section.id" class="q-mb-lg">
            <div class="text-h6">{{ section.title }}</div>
            <div class="archive-content" v-html="html(section.content)" />
            <q-card
              v-for="question in section.questions.filter(matches)"
              :key="question.id"
              flat
              bordered
              class="q-my-sm"
            >
              <q-card-section
                ><q-checkbox
                  v-model="selected"
                  :val="question.id"
                  :label="`Question ${question.number}`" />
                <div class="archive-content" v-html="html(question.content)" />
                <div
                  v-for="answer in question.answers"
                  :key="answer.id"
                  class="row items-center q-gutter-sm q-ml-md"
                >
                  <q-icon :name="answer.correct ? 'sym_o_check' : 'sym_o_close'" />
                  <div class="archive-content" v-html="html(answer.content)" />
                </div>
                <div
                  v-if="question.answer"
                  class="archive-content q-mt-md"
                  v-html="html(question.answer)"
              /></q-card-section>
            </q-card>
          </div>
        </q-tab-panel>
        <q-tab-panel name="documents"
          ><q-list bordered separator
            ><q-item
              v-for="file in archive.manifest.files"
              :key="file.id"
              clickable
              tag="a"
              :href="fileUrl(file.id)"
              target="_blank"
              ><q-item-section>{{ file.label }}</q-item-section
              ><q-item-section side
                >{{ (file.bytes / 1024 / 1024).toFixed(1) }} MB</q-item-section
              ></q-item
            ></q-list
          ></q-tab-panel
        >
        <q-tab-panel name="grades">
          <div class="row q-gutter-sm q-mb-md">
            <q-input v-model="searchGrades" outlined dense label="Search grades" /><q-space /><q-btn
              outline
              label="Download CSV"
              type="a"
              :href="fileUrl('grades-csv')"
            /><q-btn outline label="Download PDF" type="a" :href="fileUrl('grades-pdf')" />
          </div>
          <q-table
            :rows="archive.results.rows"
            :columns="gradeColumns"
            :filter="searchGrades"
            row-key="_key"
            dense
            :pagination="{ rowsPerPage: 50 }"
          />
          <p class="text-caption q-mt-md">
            Saved final results. Unmatched copies retain their scores and are identified by their
            copy number.
          </p>
        </q-tab-panel>
      </q-tab-panels>
    </template>
    <q-dialog v-model="copyDialog"
      ><q-card style="width: 500px; max-width: 95vw"
        ><q-card-section class="text-h6">Copy selected questions</q-card-section
        ><q-card-section
          ><q-select
            v-model="destination"
            :options="destinations"
            label="Active destination project"
            outlined /></q-card-section
        ><q-card-actions align="right"
          ><q-btn v-close-popup flat label="Cancel" /><q-btn
            color="primary"
            label="Copy"
            :disable="!destination"
            @click="copyQuestions" /></q-card-actions></q-card
    ></q-dialog>
  </q-page>
</template>
<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar, type QTableColumn } from 'quasar';
import type { Exam } from '@amcui/exam-core';
import { useApiStore } from '@/stores/api';
import { useStore } from '@/stores/store';
import { safeHtml } from '@/utils/safeHtml';
interface Archive {
  cleanupPending?: boolean;
  manifest: { archivedAt: number; files: { id: string; label: string; bytes: number }[] };
  exam: Exam;
  results: {
    columns: string[];
    rows: Record<string, any>[];
    questions: { id: number; title: string; max: number }[];
  };
}
const API = useApiStore();
const store = useStore();
const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const project = computed(() => String(route.params.project));
const archive = ref<Archive>();
const loading = ref(true);
const error = ref('');
const tab = ref('questions');
const searchQuestions = ref('');
const searchGrades = ref('');
const selected = ref<string[]>([]);
const fileUrl = (id: string) =>
  `${API.URL}/project/${encodeURIComponent(project.value)}/archive/files/${encodeURIComponent(id)}?token=${encodeURIComponent(store.token || '')}`;
const gradeColumns = computed<QTableColumn[]>(() =>
  archive.value
    ? [
        { name: '_copy', field: '_copy', label: 'Copy', align: 'left', sortable: true },
        ...archive.value.results.columns.map((name) => ({
          name,
          field: name,
          label: name,
          align: 'left' as const,
          sortable: true
        })),
        ...archive.value.results.questions.map((question) => ({
          name: 'question-' + question.id,
          field: (row: Record<string, any>) => row.questions?.[question.title],
          label: `${question.title} / ${question.max}`,
          align: 'right' as const,
          sortable: true
        }))
      ]
    : []
);
function html(value: string) {
  const doc = new DOMParser().parseFromString(safeHtml(value || ''), 'text/html');
  for (const image of doc.querySelectorAll('img'))
    if (/^[\w-]{1,200}$/.test(image.id) && archive.value?.exam.graphics[image.id])
      image.src = `${API.URL}/project/${encodeURIComponent(project.value)}/static/src/graphics/${encodeURIComponent(image.id)}_thumb.jpg?token=${encodeURIComponent(store.token || '')}`;
  for (const code of doc.querySelectorAll('pre, code'))
    if (code.id && archive.value?.exam.codes[code.id])
      code.textContent = archive.value.exam.codes[code.id].content;
  return doc.body.innerHTML;
}
const matches = (question: { content: string }) =>
  question.content
    .replace(/<[^>]*>/g, ' ')
    .toLowerCase()
    .includes(searchQuestions.value.toLowerCase());
const copyDialog = ref(false);
const destination = ref('');
const destinations = ref<string[]>([]);
async function openCopy() {
  await API.getProjectList();
  destinations.value = store.projects
    .filter((project) => !project.status.archived && project.status.archiving !== '1')
    .map((project) => project.project);
  copyDialog.value = true;
}
async function copyQuestions() {
  if (!archive.value) return;
  try {
    const selection = archive.value.exam.sections
      .map((section) => ({
        sectionId: section.id,
        questionIds: section.questions
          .filter((question) => selected.value.includes(question.id))
          .map((question) => question.id)
      }))
      .filter((item) => item.questionIds.length);
    await API.$http.post(`${API.URL}/project/${encodeURIComponent(project.value)}/copy/content`, {
      destinationProjectId: destination.value,
      requestId: crypto.randomUUID(),
      selection
    });
    copyDialog.value = false;
    selected.value = [];
    $q.notify({ type: 'positive', message: 'Questions copied' });
  } catch (e: any) {
    error.value = e.response?.data?.error || e.response?.data || e.message;
  }
}
function copyProject() {
  $q.dialog({
    title: 'Copy as a new project',
    message: 'Copies questions, assets and exam settings. Students and grades are excluded.',
    prompt: { model: project.value + '-copy', type: 'text' },
    cancel: true
  }).onOk(async (name) => {
    try {
      await API.copyProject(project.value, name);
      await router.push({ name: 'Edit', params: { project: name, sectionIndex: '0' } });
    } catch (e: any) {
      error.value = e.response?.data?.error || e.response?.data || e.message;
    }
  });
}
let generation = 0;
watch(
  project,
  async (name) => {
    const current = ++generation;
    loading.value = true;
    error.value = '';
    archive.value = undefined;
    selected.value = [];
    copyDialog.value = false;
    try {
      const response = await API.$http.get(
        `${API.URL}/project/${encodeURIComponent(name)}/archive`
      );
      if (current === generation) archive.value = response.data as Archive;
    } catch (e: any) {
      if (current === generation)
        error.value = e.response?.data?.error || e.response?.data || e.message;
    } finally {
      if (current === generation) loading.value = false;
    }
  },
  { immediate: true }
);
</script>
<style scoped>
.archive-content :deep(img) {
  max-width: 100%;
  max-height: 300px;
}
.archive-content :deep(pre) {
  white-space: pre-wrap;
}
</style>
