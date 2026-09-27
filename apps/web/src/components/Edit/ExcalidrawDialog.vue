<template>
  <q-dialog
    ref="dialogRef"
    persistent
    :maximized="$q.screen.lt.sm || maximized"
    @hide="onDialogHide()"
  >
    <q-card class="q-dialog-plugin excalidraw-dialog column">
      <q-toolbar class="bg-primary text-white">
        <q-toolbar-title> Excalidraw </q-toolbar-title>
        <q-space />
        <q-btn
          flat
          :icon="maximized ? 'sym_o_fullscreen_exit' : 'sym_o_fullscreen'"
          @click="maximized = !maximized"
        />
        <q-btn flat label="discard" @click="onDialogHide()" />
        <q-btn flat label="save as" @click="saveAs" />
        <q-btn v-if="graphic" flat label="save" @click="save(graphic)" />
      </q-toolbar>
      <div class="col">
        <q-inner-loading :showing="isSaving" label="Saving..." />
        <div v-show="!isSaving" ref="excalidrawRoot" class="excalidraw">
          <q-inner-loading :showing="true" label="Please wait..." />
        </div>
      </div>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { useDialogPluginComponent, useQuasar } from 'quasar';
import { defineComponent, ref, onUnmounted, onMounted, type PropType } from 'vue';
import type { Graphics } from '../models';
import { useApiStore } from '@/stores/api';
import { useExamStore } from '@/stores/exam';
import type { Root } from 'react-dom/client';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import "@excalidraw/excalidraw/index.css";

export default defineComponent({
  name: 'ExcalidrawDialog',
  props: {
    graphic: {
      type: Object as PropType<Graphics>,
      default: undefined
    }
  },
  emits: [
    // REQUIRED; need to specify some events that your
    // component will emit through useDialogPluginComponent()
    ...useDialogPluginComponent.emits
  ],
  setup(props) {
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
    const examService = useExamStore();
    const maximized = ref(false);
    const isSaving = ref(false);

    const excalidrawRoot = ref();

    let root: Root;
    let excalidrawApi: ExcalidrawImperativeAPI;

    onMounted(async () => {
      const React = await import('react');
      const createRoot = (await import('react-dom/client')).createRoot;
      const Excalidraw = (await import('@excalidraw/excalidraw')).Excalidraw;
      root = createRoot(excalidrawRoot.value);
      let initialData: any;
      try {
        if (props.graphic) {
          initialData = await API.getStaticFileContent(
            `src/graphics/${props.graphic.id}.excalidraw`
          );
        }
        //eslint-disable-next-line
      } catch (e) {
        // ignore 404
      }
      // delay loading for canvas to have right size because of dialog animation
      setTimeout(() => {
        root.render(
          React.createElement(Excalidraw, {
            excalidrawAPI: (api: ExcalidrawImperativeAPI) => {
              excalidrawApi = api;
            },
            initialData
          })
        );
      }, 300);
    });
    onUnmounted(() => {
      if (root) {
        root.unmount();
      }
    });

    function saveAs() {
      $q.dialog({
        title: 'Save As',
        prompt: {
          model: props.graphic ? props.graphic.name.replace('.excalidraw', '') : '',
          type: 'text',
          placeholder: 'Enter new name'
        },
        cancel: true
      }).onOk(async (newName: string) => {
        if (!newName) {
          return;
        }
        const copy = examService.createGraphics();
        copy.name = newName + '.excalidraw';
        if (props.graphic) {
          copy.width = props.graphic.width;
          copy.border = props.graphic.border;
        }
        examService.addGraphics(copy);
        // fix save locking after addgraphics
        // TODO check server concurrency
        setTimeout(() => {
          save(copy);
        }, 1000);
      });
    }

    async function save(graphic: Graphics) {
      isSaving.value = true;
      try {
        const module = await import('@excalidraw/excalidraw');
        const serializeAsJSON = module.serializeAsJSON;
        const data = {
          elements: excalidrawApi.getSceneElements(),
          appState: excalidrawApi.getAppState(),
          files: excalidrawApi.getFiles()
        };
        const json = serializeAsJSON(data.elements, data.appState, data.files, 'local');
        const svgElement = await module.exportToSvg(data);
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgElement);
        const newFile = new File(
          [new Blob([svgString], { type: 'image/svg+xml' })],
          graphic.name.replace('.excalidraw', '.svg')
        );
        await API.uploadGraphics(graphic, newFile, json);
        examService.updateGraphics(graphic, {
          updatedAt: new Date().getTime().toString()
        });
        isSaving.value = false;
        onDialogOK(graphic);
      } catch (e) {
        isSaving.value = false;
        console.error(e);
      }
    }

    return {
      maximized,
      isSaving,
      dialogRef,
      excalidrawRoot,
      onDialogHide,
      onDialogOK,
      save,
      saveAs
    };
  }
});
</script>
<style scoped>
.excalidraw {
  height: 100%;
  width: 100%;
}
.excalidraw-dialog {
  height: 100%;
}
.excalidraw-dialog .q-toolbar {
  min-height: 30px;
}
.excalidraw-dialog .q-toolbar__title {
  font-size: 16px;
}
</style>
<style>
.q-dialog__inner--minimized .q-card.q-dialog-plugin.excalidraw-dialog {
  max-width: 90vw;
  min-width: 90vw;
}

@media (min-width: 992px) {
  .q-dialog__inner--minimized .q-card.q-dialog-plugin.excalidraw-dialog {
    min-width: 80vw;
    max-width: 80vw;
  }
}
</style>
