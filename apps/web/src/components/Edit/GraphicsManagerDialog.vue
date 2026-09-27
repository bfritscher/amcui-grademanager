<template>
  <q-dialog ref="dialogRef" :maximized="$q.screen.lt.sm" @hide="onDialogHide()">
    <q-card class="q-dialog-plugin graphics-manager">
      <q-toolbar class="bg-primary text-white">
        <q-toolbar-title> Graphics Manager </q-toolbar-title>
        <q-btn flat round dense icon="sym_o_close" @click="onDialogOK()" />
      </q-toolbar>
      <q-card-section class="scroll">
        <q-input v-model="search" label="Search" />
        <!-- @vue-ignore -->
        <q-uploader
          ref="uploaderRef"
          flat
          square
          multiple
          accept=".pdf,.jpeg,.jpg,.png,.svg,.excalidraw"
          auto-upload
          :factory="uploadFactory"
          class="full-width q-mt-md"
          style="max-height: none"
          @uploaded="onUploaded"
          @rejected="onRejected"
        >
          <template #header="scope">
            <div class="row no-wrap items-center q-pa-sm q-gutter-xs">
              <q-btn
                v-if="scope.queuedFiles.length > 0"
                icon="sym_o_clear_all"
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
                  DROP PDFS / IMAGES / EXCALIDRAW FILES HERE OR CLICK TO UPLOAD
                  <q-uploader-add-trigger />
                </div>
              </div>
              <q-btn v-if="scope.canAddFiles" type="a" icon="sym_o_add_box" round dense flat>
                <q-uploader-add-trigger />
                <q-tooltip>Pick Files</q-tooltip>
              </q-btn>
              <q-btn
                v-if="scope.canUpload"
                icon="sym_o_cloud_upload"
                round
                dense
                flat
                @click="scope.upload"
              >
                <q-tooltip>Upload Files</q-tooltip>
              </q-btn>

              <q-btn
                v-if="scope.isUploading"
                icon="sym_o_clear"
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
            <div class="unused text-white q-pa-xs float-right">
              <q-tooltip>These graphics are currently not inserted in the document</q-tooltip>
              Unused
            </div>
            <div class="row q-gutter-lg justify-center">
              <q-card v-for="file in scope.files" :key="file.name">
                <q-item-section>
                  <q-item-label class="full-width ellipsis">
                    {{ file.name }}
                  </q-item-label>

                  <q-item-label caption> Status: {{ file.__status }} </q-item-label>

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
                    icon="sym_o_delete"
                    @click="scope.removeFile(file)"
                  />
                </q-item-section>
              </q-card>
              <q-card
                key="newexcalidraw"
                clickable
                flat
                bordered
                square
                class="img-preview cursor-pointer"
                @click="editExcalidraw()"
              >
                <q-img
                  width="250px"
                  height="180px"
                  fit="contain"
                  src="@/assets/images/excalidraw-logo.svg"
                >
                  <div class="row no-wrap full-width items-center q-py-sm img-title">
                    <div class="ellipsis">New Excalidraw Diagram</div>
                    <q-space />
                  </div>
                </q-img>
              </q-card>
              <q-card
                v-for="item in filteredGraphics"
                :key="item.id"
                clickable
                flat
                bordered
                square
                class="img-preview cursor-pointer"
                @click="insertGraphics(item)"
              >
                <q-img
                  :src="`${examService.graphicsPreviewURL(item.id)}&t=${item.updatedAt}`"
                  width="250px"
                  height="180px"
                  fit="contain"
                >
                  <div
                    class="row no-wrap full-width items-center q-py-sm img-title"
                    :class="{ unused: !item.used }"
                  >
                    <div class="ellipsis">
                      <q-tooltip>{{ item.name }}</q-tooltip
                      >{{ item.name }}
                    </div>
                    <q-space />
                    <q-btn
                      class="q-ml-md"
                      flat
                      dense
                      round
                      icon="sym_o_delete"
                      @click.stop="deleteGraphics(item)"
                    >
                      <q-tooltip>Delete</q-tooltip>
                    </q-btn>
                  </div>
                </q-img>
                <q-btn
                  v-if="item.name.endsWith('.excalidraw')"
                  class="absolute-bottom-right q-mb-sm q-mr-sm exciladraw-btn"
                  outline
                  color="deep-purple-6"
                  @click.stop="editExcalidraw(item)"
                >
                  <q-icon class="q-mr-sm">
                    <img src="@/assets/images/excalidraw-logo.svg" />
                  </q-icon>
                  Edit
                </q-btn>
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
import { defineComponent, ref, computed, onMounted } from 'vue';
import type { Graphics, UsedGraphics } from '../models';
import { useStore } from '@/stores/store';
import { useApiStore } from '@/stores/api';
import { useExamStore } from '@/stores/exam';
import ExcalidrawDialog from './ExcalidrawDialog.vue';

type GraphicsFile = File & { __graphics: Graphics; __oldFile?: File };

export default defineComponent({
  name: 'GraphicsManagerDialog',
  emits: [
    // REQUIRED; need to specify some events that your
    // component will emit through useDialogPluginComponent()
    ...useDialogPluginComponent.emits
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
    const API = useApiStore();
    const $q = useQuasar();
    const store = useStore();
    const examService = useExamStore();

    const uploaderRef = ref();
    const search = ref('');
    const usedGraphics = computed<UsedGraphics[]>(() => {
      return Object.values(examService.exam.graphics).map((item) => {
        const uItem = item as UsedGraphics;
        uItem.used = examService.isIdInExamContent(item.id);
        return uItem;
      });
    });
    const filteredGraphics = computed(() => {
      const list = usedGraphics.value.filter((item) => {
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
        message: `${rejectedEntries.length} file(s) did not pass validation constraints`
      });
    }

    function editExcalidraw(item?: Graphics) {
      $q.dialog({
        component: ExcalidrawDialog,
        componentProps: {
          graphic: item
        }
      }).onOk((data: Graphics) => {
        if (data) {
          onDialogOK(data);
        }
      });
    }

    return {
      examService,
      uploaderRef,
      dialogRef,
      onDialogHide,
      onDialogOK,
      onRejected,
      API,
      editExcalidraw,
      search,
      filteredGraphics,
      insertGraphics(item: Graphics) {
        onDialogOK(item);
      },
      deleteGraphics(item: Graphics) {
        examService.deleteGraphics(item);
      },
      async uploadFactory(files: File[]) {
        const file = files[0] as GraphicsFile;
        let graphics = examService.getGraphicsByName(file.name as string);
        if (!graphics) {
          graphics = examService.createGraphics();
          graphics.name = file.name;
        }
        const formFields = [
          {
            name: 'id',
            value: graphics.id
          }
        ];
        file.__graphics = graphics;
        const extension = file.name.split('.').pop();
        if (extension === 'excalidraw') {
          const text = await file.text();
          const excalidrawData = JSON.parse(text);
          const module = import('@excalidraw/excalidraw');
          const svgElement = await (
            await module
          ).exportToSvg({
            elements: excalidrawData.elements,
            appState: excalidrawData.appState,
            files: excalidrawData.files
          });
          const serializer = new XMLSerializer();
          const svgString = serializer.serializeToString(svgElement);
          const newFile = new File(
            [new Blob([svgString], { type: 'image/svg+xml' })],
            graphics.name.replace('.excalidraw', '.svg')
          ) as GraphicsFile;
          newFile.__graphics = graphics;
          newFile.__oldFile = file;
          files[0] = newFile;
          formFields.push({
            name: 'excalidraw',
            value: text
          });
        }

        return {
          url: `${API.URL}/project/${API.project}/upload/graphics`,
          headers: [
            {
              name: 'Authorization',
              value: `Bearer ${store.token}`
            }
          ],
          fieldName: 'file',
          formFields
        };
      },
      onUploaded(info: { files: readonly any[]; xhr: any }) {
        uploaderRef.value.removeFile(info.files[0]);
        if (info.files[0].__oldFile) {
          uploaderRef.value.removeFile(info.files[0].__oldFile);
        }
        examService.addGraphics(info.files[0].__graphics as Graphics);
      }
    };
  }
});
</script>
<style scoped>
.img-preview:hover {
  border-color: var(--q-primary);
}
.unused {
  background-color: #f57c00;
}
.img-title {
  padding: 8px;
}
.graphics-manager .q-toolbar {
  min-height: 30px;
}
.graphics-manager .q-toolbar__title {
  font-size: 16px;
}
</style>
<style>
.img-preview:hover .q-img__content > div {
  background-color: var(--q-primary);
}
.q-dialog__inner--minimized .q-card.q-dialog-plugin.graphics-manager {
  max-width: 80vw;
  min-width: 80vw;
}

@media (min-width: 992px) {
  .q-dialog__inner--minimized .q-card.q-dialog-plugin.graphics-manager {
    max-width: 60vw;
  }
}
.exciladraw-btn {
  background-color: rgba(105, 101, 219, 0.2) !important;
}
</style>
