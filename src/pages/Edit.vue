<template>
  <loading-progress v-if="editor.isLoading" />
  <q-page v-else class="column">
    <q-banner
      v-if="API.options.status.printed && !editor.hidePrintNotification"
      inline-actions
      class="text-white bg-red q-py-none"
    >
      <div class="row no-wrap items-center">
        This project has been printed on
        {{ formatDate(API.options.status.printed, 'YYYY-MM-DD HH:mm') }}.
        <q-btn color="primary" type="a" :href="API.getDownloadZipURL()" class="q-mx-sm"
          >Download&nbsp;<small>(Zip with all PDFs)</small></q-btn
        >
        <q-btn color="primary" @click="examService.toMoodleQuiz()"
          >export moodle&nbsp;<small>quiz.xml</small></q-btn
        >
      </div>
      <template #action>
        <q-btn flat color="white" icon="sym_o_close" @click="editor.hidePrintNotification = true" />
      </template>
    </q-banner>

    <q-banner v-if="!examService.exam.source" class="text-white bg-red">
      <div class="row items-center">
        This project's templace file is empty! Select a template:
        <q-select
          v-model="editor.chooseTemplate"
          :options="editor.templateOptions"
          label="Template"
          style="min-width: 350px"
          class="q-mx-md"
        />
        <q-btn color="primary" @click="examService.loadTemplate(editor.chooseTemplate)">Load</q-btn>
      </div>
    </q-banner>
    <q-toolbar class="bg-secondary">
      <q-btn
        flat
        dense
        round
        icon="sym_o_menu"
        aria-label="Menu"
        @click="store.setDrawerLeft(!store.drawerLeftVisible)"
      />
      <q-btn color="primary" flat class="gt-xs" @click="showPropertiesManagerDialog"
        >Document properties</q-btn
      >

      <q-input
        v-model="editor.searchQuery"
        :label="`Search ${editor.searchQuery ? editor.searchResults.length + ' results' : ''}`"
        debounce="500"
        dense
        clearable
        class="gt-xs"
      />
      <q-space />
      <q-btn
        flat
        round
        dense
        icon="sym_o_undo"
        color="grey-8"
        aria-label="undo"
        @click="examService.undo"
      >
        <q-tooltip>Undo</q-tooltip>
      </q-btn>
      <q-btn
        flat
        round
        dense
        icon="sym_o_redo"
        color="grey-8"
        aria-label="redo"
        @click="examService.redo"
      >
        <q-tooltip>Redo</q-tooltip>
      </q-btn>
      <span>{{ formatDate(editor.lastPreview, 'HH:mm:ss') }}</span>
      <q-btn
        aria-label="preview"
        :color="API.logs.preview?.code > 0 ? 'warning' : ''"
        flat
        @click="showPreviewDialog()"
        >{{
          editor.previewWait
            ? 'wait'
            : API.logs.preview?.code == 0
              ? 'Preview'
              : API.logs.preview?.code > 0
                ? 'error'
                : 'compiling'
        }}</q-btn
      >
      <q-btn
        aria-label="LaTeX options"
        color="primary"
        flat
        class="gt-xs"
        :class="{ active: editor.isLatexOptionVisible }"
        @click="editor.isLatexOptionVisible = !editor.isLatexOptionVisible"
        >LaTeX options</q-btn
      >
      <q-btn aria-label="print" color="negative" flat class="gt-xs" @click="examService.print()"
        >Print</q-btn
      >
    </q-toolbar>

    <exam-search-result :query="editor.searchQuery" @results="editor.searchResults = $event" />

    <latex-options
      v-if="editor.isLatexOptionVisible"
      @close="editor.isLatexOptionVisible = false"
    ></latex-options>
    <exam-section v-else></exam-section>
  </q-page>
</template>

<script lang="ts">
import { useQuasar } from 'quasar';
import { defineComponent, reactive, watch, onMounted, onUnmounted } from 'vue';
import formatDate from '../utils/formatDate';
import LatexOptions from '../components/Edit/LatexOptions.vue';
import ExamSection from '../components/Edit/ExamSection.vue';
import PropertiesManagerDialog from '../components/Edit/PropertiesManagerDialog.vue';
import PreviewDialog from '../components/Edit/PreviewDialog.vue';
import ExamSearchResult from '../components/Edit/ExamSearchResult.vue';
import LoadingProgress from '../components/LoadingProgress.vue';
import { useApiStore } from '@/stores/api';
import { useStore } from '@/stores/store';
import { useExamStore } from '@/stores/exam';

export default defineComponent({
  name: 'Edit',
  components: { LatexOptions, ExamSection, ExamSearchResult, LoadingProgress },
  setup() {
    const $q = useQuasar();
    const API = useApiStore();
    const store = useStore();
    const examService = useExamStore();
    const editor = reactive({
      hidePrintNotification: false,
      chooseTemplate: '',
      lastPreview: 0,
      waitTime: 5 * 1000,
      previewWait: false,
      isLatexOptionVisible: false,
      isLoading: true,
      searchQuery: '',
      searchResults: [],
      templateOptions: []
    });

    let debounceTimer: number;

    function throttleDebouncePreview() {
      if (debounceTimer) {
        window.clearTimeout(debounceTimer);
      }
      if (new Date().getTime() - editor.lastPreview > editor.waitTime) {
        editor.previewWait = false;
        if (!examService.exam.source) return;
        examService.preview();
        editor.lastPreview = new Date().getTime();
      } else {
        editor.previewWait = true;
        debounceTimer = window.setTimeout(throttleDebouncePreview, editor.waitTime);
      }
    }

    function loadTemplates() {
      API.getTemplates().then((data) => {
        editor.templateOptions = data;
      });
    }

    watch(
      () => examService.exam.source,
      () => {
        if (!examService.exam.source) {
          loadTemplates();
        }
      },
      { immediate: true }
    );

    watch(
      () => API.yjsSynced,
      () => {
        editor.isLoading = !API.yjsSynced;
      },
      { immediate: true }
    );

    watch(
      () => JSON.stringify(examService.exam),
      () => {
        throttleDebouncePreview();
      },
      {
        immediate: true
      }
    );

    function shortcutListener(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 'z') {
        examService.undo();
      }
      if (e.ctrlKey && e.key === 'y') {
        examService.redo();
      }
    }

    onMounted(() => {
      document.addEventListener('keydown', shortcutListener);
    });
    onUnmounted(() => {
      document.removeEventListener('keydown', shortcutListener);
    });

    return {
      editor,
      examService,
      API,
      store,
      formatDate,
      showPropertiesManagerDialog() {
        $q.dialog({
          component: PropertiesManagerDialog,
          componentProps: {
            examService
          }
        });
      },
      showPreviewDialog() {
        $q.dialog({
          component: PreviewDialog,
          componentProps: {
            examService
          }
        });
      }
    };
  }
});
</script>
