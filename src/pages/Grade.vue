<template>
  <loading-progress v-if="gradeService.grade.showLoading" />
  <q-page v-if="!gradeService.grade.isLoading" class="column no-wrap">
    <q-banner
      v-if="API.options.status.annotated && !ui.hidePrintNotification"
      inline-actions
      class="text-white bg-red"
    >
      This project has been annotaed on
      {{ formatDate(API.options.status.annotated, 'YYYY-MM-DD HH:mm') }}.
      <q-btn color="primary" type="a" :href="API.getAnnotateZipURL()"
        >Download&nbsp;<small>(Zip with annotated PDFs)</small></q-btn
      >
      <template #action>
        <q-btn
          flat
          color="white"
          icon="mdi-close"
          @click="ui.hidePrintNotification = true"
        />
      </template>
    </q-banner>
    <q-tabs
      :model-value="tabSelected"
      class="text-grey-8"
      active-color="primary"
      indicator-color="primary"
      align="left"
    >
      <q-route-tab v-for="tab in tabItems" :key="tab.name" v-bind="tab" />
    </q-tabs>
    <q-separator />
    <div class="col col-grow relative-position">
      <q-tab-panels
        :model-value="tabSelected"
        animated
        swipeable
        class="absolute absolute-top-right absolute-bottom-left column"
      >
        <q-tab-panel name="students" class="q-pa-none col column no-wrap">
          <template v-if="tabSelected === 'students'">
            <add-file-box />
            <div v-if="ui.showDataTable" class="q-ma-md">
              <div class="text-h6">Datatable
                <q-btn
                  icon="mdi-table-eye-off"
                  flat
                  dense
                  padding="xs"
                  size="md"
                  @click="ui.showDataTable = false"
                ></q-btn>
              </div>
              <data-table
                :max-points="parseFloat(API.options.options.points_max)"
              />
            </div>
            <div v-if="ui.showHistogram" class="q-ma-md">
              <div class="text-h6">Points Histogram
                <q-btn
                  icon="mdi-eye-off-outline"
                  flat
                  dense
                  padding="xs"
                  size="md"
                  @click="ui.showHistogram = false"
                ></q-btn>
              </div>
              <histogram :values="rows.map(x => x.total || x.Total)" :min="0" :max="gradeService.grade.maxPoints" />
            </div>
            <q-banner
              v-if="showMatchLookupWarning"
              inline-actions
              class="text-white bg-orange"
            >
              Warning: It is recommanded to have at least one of the following column for manual matching: <em>{{ matchLookups.join(', ') }}</em>.
            </q-banner>
            <q-table
              v-model:pagination="ui.pagination"
              class="my-sticky-virtscroll-table col full-width"
              :virtual-scroll-sticky-size-start="48"
              :rows="rows"
              :columns="columns"
              :filter="ui.filter"
              row-key="id"
              virtual-scroll
              :rows-per-page-options="[0]"
              hide-bottom
              dense
              flat
            >
              <template #top-right="props">
                <q-input
                  v-model="ui.filter"
                  dense
                  debounce="300"
                  placeholder="Search"
                >
                  <template #prepend>
                    <q-icon name="search" />
                  </template>
                </q-input>
                <q-btn
                  flat
                  round
                  dense
                  :icon="props.inFullscreen ? 'fullscreen_exit' : 'fullscreen'"
                  class="q-ml-md"
                  @click="props.toggleFullscreen"
                />
              </template>
              <template #header="props">
                <q-tr :props="props" class="bg-white">
                  <q-th key="_actions" :props="props">
                    <q-btn
                      icon="mdi-table-edit"
                      flat
                      label="Edit"
                      @click="showEditColumnsDialog()"
                    ></q-btn>
                  </q-th>
                  <q-th
                    v-for="col in studentsFieldFiltered"
                    :key="col"
                    :props="props"
                  >
                    <span>{{ col }}</span>
                  </q-th>
                  <q-th key="FinalGrade" class="text-left" :props="props">
                    <span style="font-size: 70%">FinalGrade</span>
                    <q-input
                      v-model="API.options.options.final_grade_formula"
                      label="Final grade formula"
                      style="width: 185px"
                      debounce="500"
                      dense
                      autocomplete="off"
                      @update:model-value="
                        API.saveOptions();
                        gradeService.calculateGrades();
                      "
                    />
                  </q-th>
                  <q-th key="Grade" class="text-left grade-max" :props="props">
                    <span style="font-size: 70%">Grade</span>
                    <q-input
                      v-model="API.options.options.points_max"
                      label="Points"
                      debounce="500"
                      class="text-right"
                      min="0"
                      type="number"
                      dense
                      style="min-width: 80px;width:100px"
                      @update:model-value="
                        API.saveOptions();
                        gradeService.calculateGrades();
                      "
                    >
                      <template #before>
                        <q-btn
                          :icon="
                            ui.showDataTable
                              ? 'mdi-table-eye-off'
                              : 'mdi-table-eye'
                          "
                          flat
                          dense
                          padding="xs"
                          @click="ui.showDataTable = !ui.showDataTable"
                        >
                          <q-tooltip>Datatable</q-tooltip>
                        </q-btn>
                      </template>
                    </q-input>
                  </q-th>
                  <q-th key="Total" :props="props">
                    <span style="font-size: 80%">Total</span>
                    <span class="question-max q-ml-sm"
                      >(max:{{ gradeService.grade.maxPoints }})</span
                    ><br />
                    <q-btn
                          :icon="
                            ui.showHistogram
                              ? 'mdi-eye-off-outline'
                              : 'mdi-chart-box-outline'
                          "
                          flat
                          dense
                          padding="xs"
                          @click="ui.showHistogram = !ui.showHistogram"
                        >
                      <q-tooltip>Histogram</q-tooltip>
                    </q-btn>
                    <q-btn
                      size="md"
                      padding="xs"
                      flat
                      dense
                      @click="ui.displayQuestions = !ui.displayQuestions"
                      >{{ ui.displayQuestions ? 'hide' : 'show' }} all</q-btn
                    >
                  </q-th>
                  <template v-if="ui.displayQuestions">
                    <q-th
                      v-for="(value, qtitle, $index) in gradeService.grade
                        .questions"
                      :key="$index"
                      class="score"
                    >
                      {{ qtitle }}<br /><span class="question-max"
                        >max {{ value.max }}</span
                      >
                    </q-th>
                  </template>
                </q-tr>
              </template>
              <template #body="props">
                <q-tr :props="props">
                  <q-td key="_actions" class="actions" :props="props">
                    <q-btn
                      v-if="props.row._unmatched"
                      color="primary"
                      size="md"
                      flat
                      aria-label="manual association"
                      @click="showAssociationDialog(props.row)"
                      >manual match</q-btn
                    >
                    <q-btn
                      v-if="!props.row._unmatched"
                      flat
                      size="md"
                      padding="xs"
                      icon="mdi-close"
                      aria-label="remove student"
                      color="negative"
                      @click="gradeService.removeStudent(props.row)"
                    >
                      <q-tooltip>remove student</q-tooltip>
                    </q-btn>
                    <q-btn
                      v-if="gradeService.grade.scores[props.row.id]"
                      flat
                      size="md"
                      padding="xs"
                      icon="mdi-link-off"
                      aria-label="unmatch student"
                      color="secondary"
                      @click="gradeService.unmatchStudent(props.row)"
                    >
                      <q-tooltip>unmatch student</q-tooltip>
                    </q-btn>
                    <q-btn
                      v-if="gradeService.grade.scores[props.row.id]"
                      flat
                      size="md"
                      padding="xs"
                      icon="mdi-eye"
                      aria-label="view annotated"
                      color="secondary"
                      @click="
                        gradeService.annotateScore(
                          gradeService.grade.scores[props.row.id]
                        )
                      "
                    >
                      <q-tooltip>view annotated copy</q-tooltip>
                    </q-btn>
                  </q-td>

                  <q-td
                    v-for="col in studentsFieldFiltered"
                    :key="col"
                    :props="props"
                    :title="col === 'id' && gradeService.grade.scores[props.row.id] ? gradeService.grade.scores[props.row.id].key : ''"
                  >
                    {{ props.row[col] }}
                    <q-popup-edit
                      v-if="(col !== 'id' || !gradeService.grade.scores[props.row.id]) && !props.row._unmatched"
                      v-model="props.row[col]"
                      buttons
                      @update:model-value="gradeService.calculateGrades()"
                    >
                      <template #="scope">
                        <q-input
                          v-model="scope.value"
                          type="text"
                          dense
                          autofocus
                          @keyup.enter="scope.set"
                          @keyup.esc="scope.cancel"
                        />
                      </template>
                    </q-popup-edit>
                  </q-td>
                  <!-- TODO-nice limits as parameters -->
                  <q-td
                    key="FinalGrade"
                    :props="props"
                    class="text-right grade"
                    :class="{
                      'grade-fail': props.row.FinalGrade < 3.5,
                      'grade-pass': props.row.FinalGrade >= 4,
                      'grade-remed':
                        props.row.FinalGrade >= 3.5 && props.row.FinalGrade < 4,
                    }"
                  >
                    {{ props.row.FinalGrade }}
                  </q-td>
                  <q-td
                    key="Grade"
                    :props="props"
                    class="text-right grade"
                    :class="{
                      'grade-fail': props.row.Grade < 3.5,
                      'grade-pass': props.row.Grade >= 4,
                      'grade-remed':
                        props.row.Grade >= 3.5 && props.row.Grade < 4,
                    }"
                  >
                    {{ props.row.Grade }}
                  </q-td>
                  <q-td key="Total" :props="props" class="text-right">
                    {{ props.row._unmatched ? props.row.total : props.row.Total }}
                  </q-td>
                  <template v-if="ui.displayQuestions">
                    <template v-if="props.row._unmatched">
                      <q-td
                        v-for="(value, qtitle) in gradeService.grade.questions"
                        :key="qtitle"
                        class="text-right score"
                        :class="`why-${
                          gradeService.grade.whys[
                            props.row.key + ':' + value.question
                          ]
                        }`"
                      >
                        <router-link
                          :to="{
                            name: 'ScanPreview',
                            params: {
                              project: API.project,
                              student: props.row.student,
                              page: value.page,
                              copy: props.row.copy,
                              question: value.question,
                            },
                          }"
                        >
                          {{ props.row.questions[qtitle] }}
                        </router-link>
                      </q-td>
                    </template>
                    <template v-else>
                      <q-td
                        v-for="(value, qtitle) in gradeService.grade.questions"
                        :key="qtitle"
                        class="text-right score"
                        :class="`why-${
                          gradeService.grade.scores[props.row.id]
                            ? gradeService.grade.whys[
                                gradeService.grade.scores[props.row.id].key +
                                  ':' +
                                  value.question
                              ]
                            : '404'
                        }`"
                      >
                        <router-link
                          v-if="gradeService.grade.scores[props.row.id]"
                          :to="{
                            name: 'ScanPreview',
                            params: {
                              project: API.project,
                              student:
                                gradeService.grade.scores[props.row.id].student,
                              page: value.page,
                              copy: gradeService.grade.scores[props.row.id]
                                .copy,
                              question: value.question,
                            },
                          }"
                        >
                          {{
                            gradeService.grade.scores[props.row.id].questions[
                              qtitle
                            ]
                          }}
                        </router-link>
                      </q-td>
                    </template>
                  </template>
                </q-tr>
              </template>
              <template #bottom-row="props">
                <q-tr class="border">
                  <q-th>
                    <q-btn color="negative" @click="gradeService.annotateAll()"
                      >Annotate All</q-btn
                    >
                  </q-th>
                  <q-th
                    v-for="(col, $index) in studentsFieldFiltered"
                    :key="$index"
                    :class="`text-${
                      props.cols.find((c) => c.name === col)?.align
                    }`"
                  >
                  <template v-if="col !== 'id'">
                    {{
                      props.cols.find((c) => c.name === col)?.align ===
                        'left'
                        ? gradeService.grade.students.data.length
                        : gradeService.avgStudentField(col).toFixed(2)
                    }}
                    </template>
                    <template v-else>
                      <span v-if="Object.values(gradeService.grade.unmatched).length > 0">{{ Object.values(gradeService.grade.unmatched).length }} <q-tooltip>Unmatched rows</q-tooltip></span> |
                      <span>{{ gradeService.grade.students.data.length}} <q-tooltip>Student rows</q-tooltip></span>

                    </template>
                  </q-th>
                  <q-th class="text-right">
                    {{ gradeService.avgStudentField('FinalGrade').toFixed(2) }}
                  </q-th>
                  <q-th class="text-right">
                    {{ gradeService.avgStudentField('Grade').toFixed(2) }}
                  </q-th>
                  <q-th class="text-right">
                    {{ gradeService.avgScoreField('total').toFixed(2) }}
                  </q-th>
                  <template v-if="ui.displayQuestions">
                    <q-th
                      v-for="(value, qtitle) in gradeService.grade.questions"
                      :key="qtitle"
                      class="text-right score"
                    >
                      {{
                        (
                          (gradeService.avgQuestion(qtitle) / value.max) *
                          100
                        ).toFixed(0)
                      }}%
                    </q-th>
                  </template>
                </q-tr>
                <q-tr>
                  <q-td colspan="100%">
                    <div class="legend q-py-md">
                      <div>
                        <span class="why-E">E</span> means syntax error (several
                        boxes ticked for a simple question, or " none of the
                        above" AND another box ticked for a multiple question).
                      </div>
                      <div>
                        <span class="why-V">V</span> means that no box are
                        ticked.
                      </div>
                      <div>
                        <span class="why-P">P</span> means that a floor has been
                        applied.
                      </div>
                    </div></q-td
                  >
                </q-tr>
              </template>
            </q-table>
          </template>
        </q-tab-panel>
        <q-tab-panel name="stats" class="q-pa-none">
          <grade-stats
            v-if="tabSelected === 'stats'"
            :stats="gradeService.grade.stats"
          ></grade-stats>
        </q-tab-panel>
        <q-tab-panel
          v-for="(file, index) in gradeService.grade.files"
          :key="index"
          :name="`file${index}`"
          class="q-pa-none"
        >
          <!-- only render if actif tab -->
          <grade-file
            v-if="tabSelected === `file${index}`"
            :file="file"
            @import-cols="importCols(file)"
            @remove-file="removeFile(file)"
          ></grade-file>
        </q-tab-panel>
      </q-tab-panels>
    </div>
  </q-page>
</template>

<script lang="ts">
import {
  defineComponent,
  inject,
  reactive,
  computed,
  onMounted,
  watchEffect,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import GradeStats from '../components/Grade/GradeStats.vue';
import GradeFileComponent from '../components/Grade/GradeFile.vue';
import DataTable from '../components/Grade/DataTable.vue';
import Api from '../services/api';
import GradeService from '../services/grade';
import { GradeFile, GradeRecord } from '../components/models';
import AssociationDialog from '../components/Grade/AssociationDialog.vue';
import EditColumsDialog from '../components/Grade/EditColumnsDialog.vue';
import { useQuasar } from 'quasar';
import formatDate from '../utils/formatDate';
import AddFileBox from '../components/Grade/AddFileBox.vue';
import LoadingProgress from '../components/LoadingProgress.vue';
import { matchLookups } from '../utils/options';
import Histogram from 'src/components/Grade/Histogram.vue';

export default defineComponent({
  name: 'Grade',
  components: {
    GradeStats,
    GradeFile: GradeFileComponent,
    DataTable,
    AddFileBox,
    LoadingProgress,
    Histogram
},
  setup() {
    const API = inject('API') as Api;
    const gradeService = inject('gradeService') as GradeService;
    const route = useRoute();
    const router = useRouter();
    const $q = useQuasar();
    const ui = reactive({
      hidePrintNotification: false,
      // students tab
      displayQuestions: false,
      showDataTable: false,
      showHistogram: false,
      filter: '',
      pagination: {
        rowsPerPage: 0,
      },
    });

    const tabSelected = computed(() => {
      return route.params.tab || 'student';
    });

    const tabItems = computed(() => {
      return [
        {
          label: 'Students',
          name: 'students',
          to: {
            name: 'Grade',
            params: {
              project: route.params.project,
              tab: 'students',
            },
          },
        },
        {
          label: 'Stats',
          name: 'stats',
          to: {
            name: 'Grade',
            params: {
              project: route.params.project,
              tab: 'stats',
            },
          },
        },
      ].concat(
        gradeService.grade.files.map((file, index) => ({
          label: file.name.substring(0, 20),
          name: `file${index}`,
          to: {
            name: 'Grade',
            params: {
              project: route.params.project,
              tab: `file${index}`,
            },
          },
        }))
      );
    });

    const showMatchLookupWarning = computed(() => {
      return !gradeService.grade.students.fields.some((field) => {
        return matchLookups.includes(field.toLowerCase());
      });
    });

    // students table

    const computeAlignement = (field: string): string => {
      for (const row of gradeService.grade.students.data) {
        if (isNaN(Number(row[field]))) {
          return 'left';
        }
      }
      return 'right';
    };

    const rows = computed(() => {
      let rows = Object.values(gradeService.grade.unmatched).map((row) => {
        const rowCopy = Object.assign({}, row);
        rowCopy.id = row.student + ':' + row.copy;
        rowCopy._unmatched = true;
        return rowCopy;
      });
      rows = rows.concat(gradeService.grade.students.data);
      return rows;
    });

    const studentsFieldFiltered = computed(() => {
      return gradeService.grade.students.fields.filter(
        (f) => !['Total', 'FinalGrade', 'Grade'].includes(f)
      );
    });

    const columns = computed(() => {
      let headers = [
        {
          name: '_actions',
          align: 'left',
        } as {
          name: string;
          label?: string;
          field?: string | ((f: string) => string);
          align?: string | ((f: string) => string);
          sortable?: boolean;
          headerClasses?: string;
        },
      ]
        .concat(
          studentsFieldFiltered.value.map((f) => ({
            name: f,
            label: f,
            field: f,
            align: computeAlignement(f), // TODO: optimize?
            sortable: true,
          }))
        )
        .concat([
          {
            name: 'FinalGrade',
            label: 'Final grade formula',
            headerClasses: '',
            field: 'FinalGrade',
            align: 'right',
            sortable: true,
          },
          {
            name: 'Grade',
            label: 'Points',
            headerClasses: '',
            field: 'Grade',
            align: 'right',
            sortable: true,
          },
          {
            label: 'Total',
            name: 'Total',
            headerClasses: '',
            field: 'Total',
            align: 'right',
            sortable: true,
          },
        ]);
      if (ui.displayQuestions) {
        headers = headers.concat(
          Object.keys(gradeService.grade.questions).map((qtitle) => ({
            label: qtitle,
            name: qtitle,
          }))
        );
      }
      return headers;
    });

    onMounted(() => {
      // TODO-p2 on params change router check
      gradeService.loadData();
    });

    watchEffect(() => {
      if (route.name === 'Grade' && !route.params.tab) {
        router.push({
          name: 'Grade',
          params: {
            project: route.params.project,
            tab: 'students',
          },
        });
      }
    });

    return {
      API,
      gradeService,
      ui,
      tabSelected,
      tabItems,
      showMatchLookupWarning,
      matchLookups,
      rows,
      columns,
      studentsFieldFiltered,
      formatDate,
      importCols(file: GradeFile) {
        gradeService.importCols(file);
        router.push({
          name: 'Grade',
          params: {
            project: route.params.project,
            tab: 'students',
          },
        });
      },
      removeFile(file: GradeFile) {
        $q.dialog({
          title: 'Confirm file removal!',
          message: `All data of file ${file.name} will be removed.`,
          persistent: true,
          ok: {
            label: 'Remove',
            color: 'negative',
            flat: true,
          },
          cancel: 'Cancel',
        }).onOk(() => {
          gradeService.removeFile(file);
          router.push({
            name: 'Grade',
            params: {
              project: route.params.project,
              tab: 'students',
            },
          });
        });
      },
      showAssociationDialog(row: GradeRecord){
        gradeService.grade.isLoading = true;
        $q.dialog({
          component: AssociationDialog,
          componentProps: {
            row,
          },
        }).onDismiss(() => {
          gradeService.calculateGrades();
          gradeService.grade.isLoading = false;
        })

      },
      showEditColumnsDialog() {
        $q.dialog({
          component: EditColumsDialog,
          componentProps: {
            fields: gradeService.grade.students.fields,
          },
        });
      },
    };
  },
});
</script>
<style scoped>
.why-V {
  background-color: rgb(241, 233, 56);
}

.why-E {
  background-color: rgb(255, 84, 84);
}

.why-P {
  background-color: rgb(213, 188, 236);
}

.grade-pass {
  color: rgb(69, 134, 22);
}

.grade-fail {
  color: rgb(255, 71, 19);
}

.grade-remed {
  color: rgb(245, 166, 65);
}
.my-sticky-virtscroll-table {
  /* height or max-height is important */
  height: 100%;
}
.my-sticky-virtscroll-table.fullscreen {
  height: 100vh;
}

.my-sticky-virtscroll-table .q-table__top,
.my-sticky-virtscroll-table .q-table__bottom,
.my-sticky-virtscroll-table thead tr:first-child th /* bg color is important for th; just specify one */ {
  background-color: #fff;
}
.my-sticky-virtscroll-table thead tr th {
  position: sticky;
  z-index: 1;
}
/* this will be the loading indicator */
.my-sticky-virtscroll-table thead tr:last-child th {
  /* height of all previous header rows */
  top: 48px;
}
.my-sticky-virtscroll-table thead tr:first-child th {
  top: 0;
}

.my-sticky-virtscroll-table th,
.my-sticky-virtscroll-table td {
  white-space: nowrap;
  padding: 1px;
}

.my-sticky-virtscroll-table .actions .q-btn.text-secondary:hover {
  color: var(--q-primary) !important;
}

.my-sticky-virtscroll-table .border th {
  border-top-width: 1px;
}

.score {
  font-size: 80%;
}

.score a {
  text-decoration: none;
  color: #000;
  display: block;
}

.my-sticky-virtscroll-table th.score,
.my-sticky-virtscroll-table td.score {
  padding: 1px 3px 1px 1px;
}

.question-max {
  font-size: 70%;
}
.legend {
  font-size: 80%;
}

.legend span {
  display: inline-block;
  padding: 4px 8px;
  margin-right: 0.5em;
}
</style>
<style>
.my-sticky-virtscroll-table .q-table {
  border-spacing: 4px 0;
  width: auto;
}
</style>
