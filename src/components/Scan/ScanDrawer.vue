<template>
  <div class="fit column no-wrap">
    <div class="q-pa-md col-4 scroll">
      <h6 class="text-h6 q-my-none">Upload papers</h6>
      <q-uploader
        ref="uploaderRef"
        flat
        accept=".pdf,.jpeg,.jpg,.png,.tiff,.tif"
        auto-upload
        class="full-width"
        :factory="uploadFactory"
        :disable="API.options.options.auto_capture_mode !== '1' && API.options.options.auto_capture_mode !== '0'"
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
                DROP FILE HERE OR CLICK TO UPLOAD
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
      </q-uploader>
      <h6 class="q-my-none">Scanned papers</h6>

      <p>
        Complete: {{ scan.missing.complete }}
        <span v-if="scan.missing.incomplete > 0"
          >Incomplete: {{ scan.missing.incomplete }}</span
        >
      </p>
      <template v-if="scan.missing.missing.length > 0">
        <h6 class="q-my-none">
          Missing pages: {{ scan.missing.missing.length }}
        </h6>
        <div>
          <div v-for="(missing, index) in scan.missing.missing" :key="index">
            {{ missing.student }}/{{ missing.page
            }}<span v-if="parseInt(missing.copy, 10) > 0"
              >:{{ missing.copy }}</span
            >
          </div>
        </div>
      </template>
      <template v-if="scan.missing.failed.length > 0">
        <h6 class="q-my-none">
          Failed pages: {{ scan.missing.failed.length }}
        </h6>
        <div>
          <div v-for="(failed, index) in scan.missing.failed" :key="index">
            {{ failed.filename }}
          </div>
        </div>
      </template>
    </div>
    <q-separator />
    <q-table
      v-model:pagination="scan.pagination"
      class="scan-table col"
      :columns="scan.columns"
      :rows="scan.pages"
      :filter="scan.search"
      :loading="scan.loading"
      :rows-per-page-options="[0]"
      :selected="selectedPage"
      row-key="id"
      hide-bottom
      dense
      flat
      virtual-scroll
      :virtual-scroll-sticky-size-start="28"
      @row-click="(evt, row) => goToPage(row)"
    >
      <template #loading>
        <q-inner-loading showing color="primary" />
      </template>
      <template #top>
        <q-input v-model="scan.search" class="full-width" label="Search">
          <template #append>
            <q-icon name="search" />
          </template>
        </q-input>
      </template>
      <template #header-cell-id="props">
        <q-th :props="props">
          {{ props.col.label }}
          <q-icon name="mdi-help-circle" size="1.5em">
            <q-tooltip>
              <div class="preview-color">
                Student/Page:Copy<br />
                <span class="auto"></span> auto<br />
                <span class="manual"></span> manual
              </div>
            </q-tooltip>
          </q-icon>
        </q-th>
      </template>
      <template #header-cell-timestamp="props">
        <q-th :props="props">
          {{ props.col.label }}
        </q-th>
      </template>
      <template #header-cell-mse="props">
        <q-th :props="props">
          {{ props.col.label }}
          <q-icon name="mdi-help-circle" size="1.5em">
            <q-tooltip>
              <div style="max-width: 200px">
                The value MSD (mean square deviation) is an indication of the
                good framing of the marks (the four black dots surrounding each
                copy).<br />
                When it is too great, the framing must be checked.
              </div></q-tooltip
            >
          </q-icon>
        </q-th>
      </template>
      <template #header-cell-s="props">
        <q-th :props="props">
          {{ props.col.label }}
          <q-icon name="mdi-help-circle" size="1.5em">
            <q-tooltip>
              <div style="max-width: 200px">
                The value sensitivity is an indicator of proximity of the
                filling of the boxes with the threshold.<br />
                If it is too great (from 8 to its max value 10), you must check
                whether the boxes recognized as checked are the good ones.
              </div></q-tooltip
            >
          </q-icon>
        </q-th>
      </template>
      <template #body-cell-id="props">
        <q-td
          :props="props"
          :class="{
            manual: props.row.timestamp_manual > 0,
            auto: props.row.timestamp_auto > 0,
          }"
        >
          <div class="row flex-center">
            <span>{{ props.value }}</span>
            <q-space></q-space>
            <q-btn
              icon="mdi-close"
              size="sm"
              padding="none"
              flat
              @click="deletePage(props.row)"
            ></q-btn>
          </div>
        </q-td>
      </template>
      <template #bottom-row>
        <q-tr>
          <q-td colspan="100%">
            <q-btn
              v-if="scan.pages.length > 0"
              color="negative"
              class="full-width q-ma-lg"
              @click="deleteAll()"
              >delete all scans</q-btn
            >


          </q-td>
        </q-tr>
      </template>
    </q-table>
  </div>
</template>

<script lang="ts">
import {
  defineComponent,
  reactive,
  onMounted,
  inject,
  computed,
  ref,
  onUnmounted,
} from 'vue';
import formatDate from '../../utils/formatDate';
import { useRouter, useRoute } from 'vue-router';
import Api from '../../services/api';
import { Page, PageScan } from '../models';
import { useQuasar } from 'quasar';
import { useStore } from '../../store';

export default defineComponent({
  name: 'ScanDrawer',
  setup() {
    const API = inject('API') as Api;
    const store = useStore();
    const router = useRouter();
    const route = useRoute();
    const $q = useQuasar();
    const scan = reactive({
      loading: true,
      columns: [
        {
          name: 'id',
          label: 'Identifier',
          field: 'id',
          align: 'left',
          sortable: true,
        },
        {
          name: 'timestamp',
          label: 'Updated',
          field: (item: PageScan) =>
            item.timestamp_manual || item.timestamp_auto,
          format: (val: string) =>
            formatDate(parseInt(val, 10) * 1000, 'DD/MM/YYYY HH:mm'),
          sortable: true,
          align: 'left',
        },
        {
          name: 'mse',
          label: 'MSD',
          field: 'mse',
          align: 'right',
          format: (val: number) => val.toFixed(1),
          classes: (row: PageScan) => (row.mse >= 3 ? 'mse-threshold' : ''),
          sortable: true,
        },
        {
          name: 's',
          label: 'Sensitivity',
          field: 's',
          align: 'right',
          format: (val: number, row: PageScan) => {
            let data = val.toFixed(1);
            if (row.timestamp_manual > 0) {
              data = `(${data})`;
            }
            return data;
          },
          classes: (row: PageScan) => (row.s >= 8 ? 's-threshold' : ''),
          sortable: true,
        },
      ],
      search: '',
      pagination: {
        rowsPerPage: 0,
      },
      pages: [] as PageScan[],
      missing: {
        complete: 0,
        incomplete: 0,
        missing: [] as Page[],
        failed: [] as any[],
      },
    });

    const loadPages = () => {
      scan.loading = true;
      // TODO-nice move to service? #47
      Promise.all([
        API.$http
          .get(API.URL + '/project/' + route.params.project + '/capture')
          .then((r) => {
            scan.pages = r.data;
          }),
        API.$http
          .get(API.URL + '/project/' + route.params.project + '/missing')
          .then((r) => {
            scan.missing = r.data;
          }),
      ]).then(() => {
        scan.loading = false;
      });
    };

    function handleNavKeys(e: KeyboardEvent) {
      if (e.key === 'PageDown') {
        nextPage(1);
      }
      if (e.key === 'PageUp') {
        nextPage(-1);
      }
    }

    onMounted(loadPages);
    onMounted(() => {
      window.addEventListener('keydown', handleNavKeys)
    });
    onUnmounted(() => {
      window.removeEventListener('keydown', handleNavKeys);
    });

    const selectedPage = computed(() => {
      return [
        {
          id: `${route.params.student}/${route.params.page}:${route.params.copy}`,
        },
      ];
    });

    function deleteScan(page: PageScan) {
      const id = `${page.student}/${page.page}:${page.copy}`;
      return API.$http
        .post(
          API.URL + '/project/' + route.params.project + '/capture/delete',
          page
        )
        .then(() => {
          scan.pages.splice(scan.pages.indexOf(page), 1);
          if (
            id ===
            `${route.params.student}/${route.params.page}:${route.params.copy}`
          ) {
            router.push({
              name: 'Scan',
              params: {
                project: route.params.project,
              },
            });
          }
        });
    }

    function deleteAllScan() {
      if (scan.pages.length > 0) {
        deleteScan(scan.pages[0]).then(deleteAllScan);
      }
    }

    function goToPage(page: Page) {
        router.push({
          name: 'ScanPreview',
          params: {
            project: route.params.project,
            page: page.page,
            student: page.student,
            copy: page.copy,
          },
        });
      }

    function nextPage(step: number) {
      const currentPageIndex = scan.pages.findIndex(
        (page) =>
          page.id === selectedPage.value[0].id
      );
      let nextIndex;
      if (step > 0) {
        nextIndex = currentPageIndex + step < scan.pages.length ? currentPageIndex + step : 0;
      } else {
        nextIndex = currentPageIndex + step >= 0 ? currentPageIndex + step : scan.pages.length - 1;
      }
      goToPage(scan.pages[nextIndex]);
    }

    const uploaderRef = ref();

    function onRejected(rejectedEntries: any[]) {
      $q.notify({
        type: 'negative',
        message: `${rejectedEntries.length} file(s) did not pass validation constraints`,
      });
    }

    return {
      scan,
      selectedPage,
      uploaderRef,
      deletePage(page: PageScan) {
        const id = `${page.student}/${page.page}:${page.copy}`;
        $q.dialog({
          title: 'Confirm',
          message: `Delete page ${id} ?`,
          cancel: true,
          ok: 'Delete',
          color: 'negative',
          persistent: true,
          noEscDismiss: true,
          noBackdropDismiss: true,
        }).onOk(() => {
          deleteScan(page);
        });
      },
      deleteAll() {
        $q.dialog({
          title: 'Warning!',
          message:
            'This will remove all scans, grades and matchings. Do you want to continue?',
          cancel: true,
          ok: 'Delete All',
          color: 'negative',
          persistent: true,
          noEscDismiss: true,
          noBackdropDismiss: true,
        }).onOk(() => {
          deleteAllScan();
        });
      },
      goToPage,
      nextPage,
      onRejected,
      onUploaded(info: { files: any[]; xhr: any }) {
        uploaderRef.value.removeFile(info.files[0]);
        // TODO-nice: better way #47 ?
        loadPages();
      },
      uploadFactory() {
        return {
          url: `${API.URL}/project/${API.project}/upload`,
          headers: [
            {
              name: 'Authorization',
              value: `Bearer ${store.state.token}`,
            },
          ],
          fieldName: 'file',
        };
      },
      onKeypress(event: KeyboardEvent) {
        console.log(event);
      }
    };
  },
});
</script>
<style scoped>
.preview-color  {
  line-height: 20px;
}
.preview-color span{
  width: 16px;
  height: 16px;
  display: inline-block;
  vertical-align: middle;
}
.auto {
  background-color: lightgreen;
}

.manual {
  background-color: lightblue;
}

.scan-table {
  height: 100%;
}

.scan-table .q-table__top,
.scan-table .q-table__bottom,
.scan-table thead tr:first-child th /* bg color is important for th; just specify one */ {
  background-color: #fff;
}
.scan-table thead tr th {
  position: sticky;
  z-index: 1;
}
/* this will be the loading indicator */
.scan-table thead tr:last-child th {
  /* height of all previous header rows */
  top: 28px;
}
.scan-table thead tr:first-child th {
  top: 0;
}
</style>
<style>
.scan-table .q-table td.s-threshold,
.q-table td.mse-threshold {
  background-color: red;
}
.scan-table .q-table tbody td {
  font-size: 14px;
}
.scan-table .q-table th {
  font-size: 13px;
}
</style>
