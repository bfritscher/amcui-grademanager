<template>
  <q-dialog ref="dialogRef" :maximized="$q.screen.lt.sm" @hide="onDialogHide()">
    <q-card class="q-dialog-plugin graphics-manager">
      <q-toolbar class="bg-primary text-white">
        <q-toolbar-title> Graphics Manager </q-toolbar-title>
        <q-btn flat round dense icon="mdi-close" @click="onDialogOK()" />
      </q-toolbar>
      <q-card-section class="scroll">
        <q-input v-model="search" label="Search" />
        <q-uploader
          ref="uploaderRef"
          flat
          square
          multiple
          accept=".pdf,.jpeg,.jpg,.png"
          auto-upload
          :factory="uploadFactory"
          class="full-width q-mt-md"
          style="max-height: none;"
          @uploaded="onUploaded"
          @rejected="onRejected"
        >
          <template #header="scope">
            <div class="row no-wrap items-center q-pa-sm q-gutter-xs">
              <q-btn
                v-if="scope.queuedFiles.length > 0"
                icon="clear_all"
                round
                dense
                flat
                @click="scope.removeQueuedFiles"
              >
                <q-tooltip>Clear All</q-tooltip>
              </q-btn>
              <q-spinner v-if="scope.isUploading" class="q-uploader__spinner" />
              <div class="col">
                <div class="q-uploader__title">
                  DROP PDFS OR IMAGES HERE OR CLICK TO UPLOAD
                  <q-uploader-add-trigger />
                </div>
              </div>
              <q-btn
                v-if="scope.canAddFiles"
                type="a"
                icon="add_box"
                round
                dense
                flat
              >
                <q-uploader-add-trigger />
                <q-tooltip>Pick Files</q-tooltip>
              </q-btn>
              <q-btn
                v-if="scope.canUpload"
                icon="cloud_upload"
                round
                dense
                flat
                @click="scope.upload"
              >
                <q-tooltip>Upload Files</q-tooltip>
              </q-btn>

              <q-btn
                v-if="scope.isUploading"
                icon="clear"
                round
                dense
                flat
                @click="scope.abort"
              >
                <q-tooltip>Abort Upload</q-tooltip>
              </q-btn>
            </div>
          </template>
          <template #list="scope">
            <div class="row q-gutter-lg justify-center">
              <q-card v-for="file in scope.files" :key="file.name">
                <q-item-section>
                  <q-item-label class="full-width ellipsis">
                    {{ file.name }}
                  </q-item-label>

                  <q-item-label caption>
                    Status: {{ file.__status }}
                  </q-item-label>

                  <q-item-label caption>
                    {{ file.__sizeLabel }} / {{ file.__progressLabel }}
                  </q-item-label>
                </q-item-section>

                <q-item-section v-if="file.__img" thumbnail class="gt-xs">
                  <img :src="file.__img.src" />
                </q-item-section>

                <q-item-section top side>
                  <q-btn
                    class="gt-xs"
                    size="12px"
                    flat
                    bordered
                    dense
                    round
                    icon="delete"
                    @click="scope.removeFile(file)"
                  />
                </q-item-section>
              </q-card>
              <q-card
                v-for="item in graphics"
                :key="item.id"
                clickable
                flat
                bordered
                square
                class="img-preview cursor-pointer"
                @click="insertGraphics(item)"
              >
                <q-img
                  :src="examService.graphicsPreviewURL(item.id)"
                  width="250px"
                  height="180px"
                  fit="contain"
                >
                  <div class="row no-wrap full-width items-center q-py-sm">
                    <div class="ellipsis">{{ item.name }}</div>
                    <q-space />
                    <q-btn
                      class="q-ml-md"
                      flat
                      dense
                      round
                      icon="delete"
                      @click.stop="deleteGraphics(item)"
                    />
                  </div>
                </q-img>
              </q-card>
            </div>
          </template>
        </q-uploader>
      </q-card-section>
      <q-card-actions align="right">
        <q-space />
        <q-btn color="primary" flat label="close" @click="onDialogOK()" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { useDialogPluginComponent, useQuasar } from 'quasar';
import { defineComponent, inject, ref, computed, onMounted } from 'vue';
import Api from '../../services/api';
import ExamEditor from '../../services/examEditor';
import { Graphics } from '../models';
import { useStore } from '../../store';

export default defineComponent({
  name: 'GraphicsManagerDialog',
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
    const examService = inject('examService') as ExamEditor;
    const $q = useQuasar();
    const store = useStore();

    const uploaderRef = ref();
    const search = ref('');
    const graphics = computed(() => {
      const list = Object.values(examService.exam.graphics).filter((item) => {
        return item.name.toLowerCase().includes(search.value.toLowerCase());
      });
      list.sort((a, b) => {
        return a.name.localeCompare(b.name);
      });
      return list;
    });

    onMounted(() => {
      examService.syncGraphics();
    });

    function onRejected(rejectedEntries: any[]) {
      $q.notify({
        type: 'negative',
        message: `${rejectedEntries.length} file(s) did not pass validation constraints`,
      });
    }

    return {
      uploaderRef,
      dialogRef,
      onDialogHide,
      onDialogOK,
      onRejected,
      API,
      examService,
      search,
      graphics,
      insertGraphics(item: Graphics) {
        onDialogOK(item);
      },
      deleteGraphics(item: Graphics) {
        examService.deleteGraphics(item);
      },
      uploadFactory(files: any[]) {
        const file = files[0];
        let graphics = examService.getGraphicsByName(file.name as string);
        if (!graphics) {
          graphics = examService.createGraphics();
          graphics.name = file.name;
        }
        file.__graphics = graphics;

        return {
          url: `${API.URL}/project/${API.project}/upload/graphics`,
          headers: [
            {
              name: 'Authorization',
              value: `Bearer ${store.state.token}`,
            },
          ],
          fieldName: 'file',
          formFields: [
            {
              name: 'id',
              value: graphics.id,
            },
          ],
        };
      },
      onUploaded(info: { files: any[]; xhr: any }) {
        uploaderRef.value.removeFile(info.files[0]);
        examService.addGraphics(info.files[0].__graphics as Graphics);
      },
    };
  },
});
</script>
<style scoped>
.img-preview:hover {
  border-color: var(--q-primary);
}
</style>
<style>

.img-preview:hover .q-img__content > div {
  background-color: var(--q-primary);
}
.q-dialog__inner--minimized .q-card.q-dialog-plugin.graphics-manager {
  max-width: 80vh;
  min-width: fit-content;
}

@media (min-width: 992px) {
.q-dialog__inner--minimized .q-card.q-dialog-plugin.graphics-manager {
  max-width: 60vh;
}
}
</style>
