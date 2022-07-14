<template>
  <q-dialog ref="dialogRef" persistent :maximized="$q.screen.lt.sm" @hide="onDialogHide">
    <q-card class="q-dialog-plugin">
      <q-toolbar class="bg-primary text-white">
        <q-toolbar-title> Task Progress </q-toolbar-title>
        <q-btn flat round dense icon="mdi-close" :disable="API.options.status.locked != '0'" @click="onDialogOK" />
      </q-toolbar>
      <q-card-section class="column no-wrap scroll">
        <div class="text-center">
          <q-btn
            v-if="API.options.status.printed && API.logs['printing done']"
            type="a"
            color="primary"
            :href="API.getDownloadZipURL()"
            >Download Zip with all PDFs</q-btn
          >
          <q-btn
            v-if="
              API.options.status.annotated &&
              API.logs['annotating done'] &&
              API.logs['annotating done'].type == 'all'
            "
            type="a"
            color="primary"
            :href="API.getAnnotateZipURL()"
            >Download Zip with all annotated PDFs</q-btn
          >
          <q-btn
            v-if="
              API.options.status.annotated &&
              API.logs['annotating done'] &&
              API.logs['annotating done'].type == 'single'
            "
            type="a"
            color="primary"
            target="_blank"
            :href="API.getStaticFileURL(API.logs['annotating done'].file)"
            >Download {{ API.logs['annotating done'].file }}</q-btn
          >
        </div>

        <div>
          <div
            v-for="(log, index) in API.sortedLogs"
            :key="index"
            class="log"
            :class="{ error: log.code > 0 }"
          >
            <div class="text-subtitle1 text-bold">{{ log.msg }}</div>
            <q-linear-progress
              :color="log.code > 0 ? 'negative' : 'primary'"
              :indeterminate="!log.progress"
              :value="log.progress * 100"
            />
            <p>
              {{ formatDate(log.start, 'HH:mm:ss') }}
              <span v-if="log.end"
                >:
                {{
                  ((log.end.getTime() - log.start.getTime()) / 1000).toFixed(0)
                }}s</span
              >
            </p>
            <pre v-if="log.command != 'prepare'">{{ log.log }}</pre>
            <pre v-if="log.command != 'prepare' && log.code > 0">{{
              log.err
            }}</pre>
          </div>
        </div>
      </q-card-section>
      <q-separator />
      <q-card-actions align="right">
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
import { defineComponent, inject } from 'vue';
import Api from '../services/api';
import formatDate from '../utils/formatDate';

export default defineComponent({
  name: 'ProgressDialog',
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

    return {
      dialogRef,
      onDialogHide,
      onDialogOK,
      API,
      formatDate,
    };
  },
});
</script>
<style scoped>
pre {
  white-space: pre-wrap
}
</style>