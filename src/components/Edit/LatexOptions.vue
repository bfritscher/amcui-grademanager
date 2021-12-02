<template>
  <q-toolbar>
    <q-tabs
      :value="editor.selectedTab"
      inline-label
      align="left"
      class="col"
      @update:model-value="load"
    >
      <q-tab name="latexSource" label="source.tex" />
      <q-tab
        name="latexPreviewQ"
        label="questions_definition.tex"
        icon="mdi-lock"
      />
      <q-tab
        name="latexPreviewL"
        label="questions_layout.tex"
        icon="mdi-lock"
      />
      <q-tab name="dataJson" label="data.json" icon="mdi-lock" />
      <q-tab name="import" label="Import" />
    </q-tabs>
    <q-space />
    <q-btn flat aria-label="close" icon="mdi-close" @click="$emit('close')" />
  </q-toolbar>
  <q-separator />
  <div class="col col-grow relative-position">
    <div class="absolute absolute-top-right absolute-bottom-left overflow-auto">
      <codemirror
        v-if="editor.selectedTab === 'latexSource'"
        v-model="examService.exam.source"
        :options="editor.latexSourceOptions"
      ></codemirror>
      <codemirror
        v-if="editor.selectedTab === 'latexPreviewQ'"
        :model-value="editor.latexPreviewQ"
        :options="editor.latexPreviewOptions"
      ></codemirror>
      <codemirror
        v-if="editor.selectedTab === 'latexPreviewL'"
        :model-value="editor.latexPreviewL"
        :options="editor.latexPreviewOptions"
      ></codemirror>
      <codemirror
        v-if="editor.selectedTab === 'dataJson'"
        :model-value="editor.dataJson"
        :options="editor.jsonPreviewOptions"
      ></codemirror>
      <div v-if="editor.selectedTab === 'import'">
        <codemirror
          v-model="editor.importSource"
          :options="editor.latexSourceOptions"
          class="border"
        ></codemirror>
        Past AMC Latex code here (amcui layout and question definition), then
        <q-btn
          color="primary"
          @click="examService.importLatex(editor.importSource)"
          >Import</q-btn
        >
        <codemirror
          v-model="editor.importJSONSource"
          :options="editor.jsonImportOptions"
          class="border"
        ></codemirror>
        Past a valid JSON sync object code here to overwrite current (You can
        loose everything!).
        <q-btn
          color="negative"
          @click="examService.importJSON(editor.importJSONSource)"
          >DANGER! overwrite!</q-btn
        >
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import ExamEditor from '../../services/examEditor';
import { defineComponent, reactive, inject } from 'vue';
import Codemirror from '../Codemirror.vue';

export default defineComponent({
  name: 'LatexOptions',
  components: {
    Codemirror,
  },
  emits: ['close'],
  setup() {
    const examService = inject('examService') as ExamEditor;
    const editor = reactive({
      selectedTab: 'latexSource',
      importSource: '',
      importJSONSource: '',
      dataJson: '',
      latexPreviewQ: '',
      latexPreviewL: '',
      latexSourceOptions: {
        mode: 'stex',
        lineNumbers: true,
        lineWrapping: true,
        viewportMargin: Infinity,
        readOnly: false,
        matchBrackets: true,
        autoCloseBrackets: true,
      },
      latexPreviewOptions: {
        mode: 'stex',
        lineNumbers: true,
        lineWrapping: true,
        viewportMargin: Infinity,
        readOnly: true,
        matchBrackets: true,
      },
      jsonPreviewOptions: {
        mode: 'application/json',
        lineNumbers: true,
        lineWrapping: true,
        viewportMargin: Infinity,
        readOnly: true,
        matchBrackets: true,
      },
      jsonImportOptions: {
        mode: 'application/json',
        lineNumbers: true,
        lineWrapping: true,
        viewportMargin: Infinity,
        readOnly: false,
        matchBrackets: true,
      },
    });

    return {
      examService,
      editor,
      load(value: string) {
        editor.selectedTab = value;
        if (value === 'dataJson') {
          editor.dataJson = 'loading...';
          setTimeout(() => {
            editor.dataJson = examService.getJSON();
          });
        }
        if (value === 'latexPreviewQ') {
          editor.latexPreviewQ = 'generating...';
          setTimeout(() => {
            editor.latexPreviewQ = examService.toLatex().questions_definition;
          });
        }
        if (value === 'latexPreviewL') {
          editor.latexPreviewL = 'generating...';
          setTimeout(() => {
            editor.latexPreviewL = examService.toLatex().questions_layout;
          });
        }
      },
    };
  },
});
</script>
