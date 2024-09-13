<template>
  <div class="bg-secondary">
    <q-btn
      v-if="ui.closed"
      size="sm"
      class="full-width"
      flat
      label="CSV Options"
      @click="ui.closed = false"
    />
    <div v-else class="q-pa-sm">
      <q-input
        v-model="ui.pasteData"
        label="Paste CSV data or drop a file"
        autogrow
        type="textarea"
        input-style="max-height:400px;"
        class="q-mb-md"
        :class="{ dragover: ui.dragover }"
        @dragenter.stop.prevent="dragenter"
        @dragleave.stop.prevent="dragleave"
        @dragover.stop.prevent=""
        @drop.stop.prevent="drop"
      />
      <div class="row">
        <q-btn label="Add to Students" flat color="primary" @click="parsePasteData()" />
        <q-btn label="Add as new file" flat color="primary" @click="parseAsNewFile()" />
        <q-space />
        <q-btn label="export" flat color="negative" @click="exportData()" />
        <q-btn label="grades.csv" flat color="positive" @click="downloadCsv()" />
      </div>
      <q-btn
        icon="sym_o_close"
        flat
        padding="xs"
        class="absolute-top-right text-grey-8 q-ma-sm"
        @click="ui.closed = true"
      />
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent, reactive, inject } from 'vue';
import GradeService from '../../services/grade';

export default defineComponent({
  setup() {
    const gradeService = inject('gradeService') as GradeService;

    const ui = reactive({
      dragover: false,
      pasteData: '',
      closed: false
    });

    function handleFiles(files: FileList) {
      [...files].forEach((file: any) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        gradeService.addNewFile(file, file.name);
      });
    }

    return {
      ui,
      dragenter() {
        ui.dragover = true;
      },
      dragleave() {
        ui.dragover = false;
      },
      drop(e: DragEvent) {
        ui.dragover = false;
        const dt = e.dataTransfer;
        if (dt && dt.files) {
          handleFiles(dt.files);
        }
      },
      exportData() {
        ui.pasteData = gradeService.exportData();
      },
      downloadCsv() {
        const csv = gradeService.exportAllData();
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'grades.csv';
        a.click();
      },
      parsePasteData() {
        gradeService.parseCSV(ui.pasteData);
        ui.pasteData = '';
      },

      parseAsNewFile() {
        // TODO-nice ask filename?
        gradeService.addNewFile(ui.pasteData);
      }
    };
  }
});
</script>
<style scoped>
.dragover {
  border: 3px dashed rgb(230, 20, 20);
}
</style>
