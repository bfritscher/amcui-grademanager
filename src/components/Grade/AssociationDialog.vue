<template>
  <q-dialog ref="dialogRef" :maximized="$q.screen.lt.sm" persistent @hide="onDialogHide">
    <q-card class="q-dialog-plugin">
      <q-toolbar class="bg-primary text-white">
        <q-toolbar-title> Manual Association </q-toolbar-title>
        <q-btn flat round dense icon="mdi-close" @click="onDialogOK" />
      </q-toolbar>
      <q-card-section v-if="toBeMatched">
        <q-img :src="API.getStaticFileURL(`cr/${toBeMatched.image}`)" />
        <q-select
          model-value=""
          label="Student name"
          use-input
          options-html
          option-label="_label"
          input-debounce="0"
          :options="options"
          @filter="filterFn"
          @update:model-value="setName"
        />
        Unmatched: {{ unmatchedNames.length + 1 }}
      </q-card-section>
      <q-card-section v-else> Everything has a match. </q-card-section>
      <q-card-actions align="right">
        <q-btn v-if="unmatchedNames.length > 0" label="skip" @click="skip()" />
        <q-space />
        <q-btn color="primary" flat label="close" @click="onDialogOK" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { match, surround } from 'fuzzyjs';
import { useDialogPluginComponent } from 'quasar';
import GradeService from '../../services/grade';
import {
  defineComponent,
  inject,
  ref,
  onMounted,
  PropType,
  computed,
} from 'vue';
import Api from '../../services/api';
import { GradeRecord, Name } from '../models';

export default defineComponent({
  name: 'AssociationDialog',
  props: {
    row: {
      type: Object as PropType<GradeRecord>,
      required: true,
    },
  },
  emits: [
    // REQUIRED; need to specify some events that your
    // component will emit through useDialogPluginComponent()
    ...useDialogPluginComponent.emits,
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
    const API = inject('API') as Api;
    const gradeService = inject('gradeService') as GradeService;

    const toBeMatched = ref();
    const unmatchedNames = ref<Name[]>([]);

    function extract(item: GradeRecord) {
      const index = unmatchedNames.value.findIndex(
        (name) => name.student === item.student && name.copy === item.copy
      );
      if (index >= 0) {
        return unmatchedNames.value.splice(index, 1)[0];
      }
      return;
    }

    function nextUnmatched() {
      return unmatchedNames.value.shift();
    }

    function skip() {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      unmatchedNames.value.push(toBeMatched.value);
      toBeMatched.value = nextUnmatched();
    }

    onMounted(() => {
      API.$http
        .get(API.URL + '/project/' + API.project + '/names')
        .then((r: any) => {
          unmatchedNames.value = (r.data as Name[]).filter(
            (item) => (!item.auto && !item.manual) || item.manual === 'NULL'
          );
          toBeMatched.value = extract(props.row) || nextUnmatched();
        });
    });

    const studentsWithoutScore = computed(() => {
      const entries = gradeService.grade.students.data.filter(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        (row) => !gradeService.grade.scores.hasOwnProperty(row.id)
      );
      entries.sort((a, b) =>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        itemAccesor(a).toLowerCase().localeCompare(itemAccesor(b).toLowerCase())
      );
      return entries;
    });

    const options = ref<any[]>([]);

    const itemAccesor = (item: {[key:string]: any}): string => {
      // TODO-nice options to configure?
      let labels: string[] = [];
      ['name', 'nom', 'prenom', 'surname', 'email'].forEach((key: string) => {
        if (item[key]) {
          labels.push(String(item[key]))
        }
      })
      return labels.join(' ');
    };

    const filterFn = (needle: string, update: any) => {
      update(() => {
        if (needle) {
          options.value = studentsWithoutScore.value
            .map((item: {[key:string]: any}) => {
              const label = itemAccesor(item);
              const result = match(needle, label, { caseSensitive: false });
              item._match = result.match;
              if (result.match) {
                item._label = surround(label, {
                  result,
                  prefix: '<strong>',
                  suffix: '</strong>',
                });
              }
              return item;
            })
            .filter((item) => item._match);
        } else {
          options.value = [];
        }
      });
    };

    const setName = (item: any) => {
      if (item && item.id) {
        toBeMatched.value.manual = item.id;
        const key = `${toBeMatched.value.student}:${toBeMatched.value.copy}`;
        const score = gradeService.grade.unmatched[key];
        if (score) {
            score.id = item.id;
            gradeService.grade.scores[score.id] = score;
            delete gradeService.grade.unmatched[key];
            API.$http.post(API.URL + '/project/' + API.project + '/association/manual', {
                student: score.student,
                copy: score.copy,
                id: score.id
            });
        }
        toBeMatched.value = nextUnmatched();
      }
    };

    return {
      dialogRef,
      onDialogHide,
      onDialogOK,
      API,
      gradeService,
      unmatchedNames,
      toBeMatched,
      studentsWithoutScore,
      skip,
      options,
      filterFn,
      setName
    };
  },
});
</script>
