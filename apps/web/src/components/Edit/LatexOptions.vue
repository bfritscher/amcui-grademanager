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
      <q-tab name="latexPreviewQ" label="questions_definition.tex" icon="sym_o_lock" />
      <q-tab name="latexPreviewL" label="questions_layout.tex" icon="sym_o_lock" />
      <q-tab name="dataJson" label="data.json" icon="sym_o_lock" />
      <q-tab name="import" label="Import" />
    </q-tabs>
    <q-space />
    <q-btn flat aria-label="close" icon="sym_o_close" @click="$emit('close')" />
  </q-toolbar>
  <q-separator />
  <div class="col col-grow relative-position">
    <div class="absolute absolute-top-right absolute-bottom-left overflow-auto">
      <codemirror
        v-if="editor.selectedTab === 'latexSource'"
        :model-value="examService.exam.source"
        :options="editor.latexSourceOptions"
        @update:model-value="examService.updateSource($event)"
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
        <q-btn color="primary" @click="examService.importLatex(editor.importSource)">Import</q-btn>
        <codemirror
          v-model="editor.importJSONSource"
          :options="editor.jsonImportOptions"
          class="border"
        ></codemirror>
        Past a valid JSON sync object code here to overwrite current (You can loose everything!).
        <q-btn color="negative" @click="importJSON">DANGER! overwrite!</q-btn>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, reactive } from 'vue';
import Codemirror from '../Codemirror.vue';
import { useExamStore } from '@/stores/exam';

export default defineComponent({
  name: 'LatexOptions',
  components: {
    Codemirror
  },
  emits: ['close'],
  setup(props, { emit }) {
    const examService = useExamStore();
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
        autoCloseBrackets: true
      },
      latexPreviewOptions: {
        mode: 'stex',
        lineNumbers: true,
        lineWrapping: true,
        viewportMargin: Infinity,
        readOnly: true,
        matchBrackets: true
      },
      jsonPreviewOptions: {
        mode: 'application/json',
        lineNumbers: true,
        lineWrapping: true,
        viewportMargin: Infinity,
        readOnly: true,
        matchBrackets: true
      },
      jsonImportOptions: {
        mode: 'application/json',
        lineNumbers: true,
        lineWrapping: true,
        viewportMargin: Infinity,
        readOnly: false,
        matchBrackets: true
      }
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
      importJSON() {
        examService.importJSON(editor.importJSONSource);
        emit('close');
      }
    };
  }
});
</script>
