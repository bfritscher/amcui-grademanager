<template>
  <q-dialog ref="dialogRef" :maximized="$q.screen.lt.sm" @hide="onDialogHide">
    <q-card class="q-dialog-plugin preview">
      <q-toolbar class="bg-primary text-white">
        <q-toolbar-title> Preview Document </q-toolbar-title>
        <q-btn flat round dense icon="mdi-close" @click="onDialogOK" />
      </q-toolbar>
      <q-card-section
        v-if="!isLogVisible && API.logs.preview && API.logs.preview.code == 0"
        class="column scroll q-pa-none"
      >
        <object
          :data="API.getStaticFileURL('out/out.pdf')"
          type="application/pdf"
          style="height: 80vh"
        >
          <p>
            Your browser does not support PDFs. Download the PDF below or do not
            use native preview.
          </p>
        </object>
      </q-card-section>
      <q-card-section
        v-if="isLogVisible || ( API.logs.preview && API.logs.preview.code != 0 )"
        class="latex-errors scroll"
      >
        <div class="text-h6 text-bold">Error</div>
        <div v-for="(err, index) in getErr()" :key="index" class="err">
          {{ err }}
        </div>
        <div class="text-h6 text-bold">Warning</div>
        <div v-for="(err, index) in getWarn()" :key="index" class="warn">
          {{ err }}
        </div>
        <div class="text-h6 text-bold">Over/Underfull</div>
        <div v-for="(err, index) in getFull()" :key="index" class="full">
          {{ err }}
        </div>
        <codemirror
          :options="logOptions"
          :model-value="API.logs.preview.log"
          style="overflow-x: hidden"
        ></codemirror>
      </q-card-section>
      <q-separator />
      <q-card-actions align="right">
        <q-btn
          v-if="API.logs.preview && API.logs.preview.code == 0"
          flat
          color="primary"
          type="a"
          :href="API.getStaticFileURL('out/out.pdf')"
          label="download"
          target="_blank"
        />
        <q-btn
          :label="isLogVisible ? 'pdf' : 'log'"
          flat
          @click="isLogVisible = !isLogVisible"
        />
        <q-space />
        <q-btn
          color="primary"
          flat
          label="close"
          :disable="API.options.status.locked != '0'"
          @click="onDialogOK"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { useDialogPluginComponent } from 'quasar';
import { defineComponent, inject, reactive, ref } from 'vue';
import Api from '../../services/api';
import formatDate from '../../utils/formatDate';
import Codemirror from '../Codemirror.vue';

export default defineComponent({
  name: 'PreviewDialog',
  components: {
    Codemirror,
  },
  emits: [
    // REQUIRED; need to specify some events that your
    // component will emit through useDialogPluginComponent()
    ...useDialogPluginComponent.emits,
  ],

  setup() {
    // REQUIRED; must be called inside of setup()
    const { dialogRef, onDialogHide, onDialogOK } = useDialogPluginComponent();
    // dialogRef      - Vue ref to be applied to QDialog
    // onDialogHide   - Function to be used as handler for @hide on QDialog
    // onDialogOK     - Function to call to settle dialog with "ok" outcome
    //                    example: onDialogOK() - no payload
    //                    example: onDialogOK({ /*.../* }) - with payload
    // onDialogCancel - Function to call to settle dialog with "cancel" outcome
    const API = inject('API') as Api;

    const logOptions = reactive({
      lineNumbers: false,
      lineWrapping: false,
      viewportMargin: Infinity,
      readOnly: true,
    });

    const isLogVisible = ref(false);

    return {
      dialogRef,
      onDialogHide,
      onDialogOK,
      API,
      formatDate,
      logOptions,
      isLogVisible,
      getErr() {
        if (API.logs && API.logs.preview) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          return new Set(API.logs.preview.log.match(/ERR(?::|>).*/g)).values();
        }
        return [];
      },

      getWarn() {
        if (API.logs && API.logs.preview) {
          return new Set(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            API.logs.preview.log.match(/pdfTeX warning.*/g)
          ).values();
        }

        return [];
      },

      getFull() {
        if (API.logs && API.logs.preview) {
          return new Set(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            API.logs.preview.log.match(/(?:Over|Under)full.*/g)
          ).values();
        }
        return [];
      },
    };
  },
});
</script>
<style scoped>
.latex-errors .err {
  color: red;
}

.latex-errors .warn {
  color: orange;
}

.latex-errors .full {
  color: teal;
}
</style>
<style>
@media (min-width: 992px) {
  .q-dialog__inner--minimized .q-card.q-dialog-plugin.preview {
    min-width: 820px;
  }
}
</style>
