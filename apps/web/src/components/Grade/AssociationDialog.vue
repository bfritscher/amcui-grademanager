<template>
  <q-dialog ref="dialogRef" :maximized="$q.screen.lt.sm" persistent @hide="onDialogHide">
    <q-card class="q-dialog-plugin">
      <q-toolbar class="bg-primary text-white">
        <q-toolbar-title> Manual Association </q-toolbar-title>
        <q-btn flat round dense icon="sym_o_close" @click="onDialogOK" />
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
        <span class="text-body2">Use down arrow and ENTER to select.</span>
        <q-space />
        <q-btn color="primary" flat label="close" @click="onDialogOK" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { useDialogPluginComponent } from 'quasar';
import GradeService from '../../services/grade';
import { match } from '../../utils/match';
import { defineComponent, ref, onMounted, type PropType, computed } from 'vue';
import type { GradeRecord, Name } from '../models';
import { matchLookups } from '../../utils/options';
import { useApiStore } from '@/stores/api';

export default defineComponent({
  name: 'AssociationDialog',
  props: {
    row: {
      type: Object as PropType<GradeRecord>,
      required: true
    },
    gradeService: {
      type: Object as PropType<GradeService>,
      required: true
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
      unmatchedNames.value.push(toBeMatched.value);
      toBeMatched.value = nextUnmatched();
    }

    onMounted(() => {
      API.$http.get(API.URL + '/project/' + API.project + '/names').then((r: any) => {
        unmatchedNames.value = (r.data as Name[]).filter(
          (item) => (!item.auto && !item.manual) || item.manual === 'NULL'
        );
        toBeMatched.value = extract(props.row) || nextUnmatched();
      });
    });

    const studentsWithoutScore = computed(() => {
      const entries = props.gradeService.grade.students.data.filter(
        (row) => !props.gradeService.grade.scores.hasOwnProperty(row.id)
      );
      entries.sort((a, b) =>
        itemAccessor(a).toLowerCase().localeCompare(itemAccessor(b).toLowerCase())
      );
      return entries;
    });

    const options = ref<any[]>([]);

    const itemAccessor = (item: { [key: string]: any }): string => {
      const labels: string[] = [];
      Object.keys(item).forEach((key: string) => {
        if (item[key] && matchLookups.includes(key.toLowerCase())) {
          labels.push(String(item[key]));
        }
      });
      return labels.join(' ');
    };

    const filterFn = (needle: string, update: any) => {
      update(() => {
        if (needle) {
          options.value = studentsWithoutScore.value
            .map((item: { [key: string]: any }) => {
              const label = itemAccessor(item);
              const result = match(needle, label);
              item._match = result.match;
              item._score = result.score;
              item._label = result.wrapped;
              return item;
            })
            .filter((item) => item._match)
            .sort((a, b) => b._score - a._score)
            .slice(0, 10);
        } else {
          options.value = [];
        }
      });
    };

    const setName = (item: any) => {
      if (item && item.id) {
        toBeMatched.value.manual = item.id;
        const key = `${toBeMatched.value.student}:${toBeMatched.value.copy}`;
        const score = props.gradeService.grade.unmatched[key];
        if (score) {
          score.id = item.id;
          props.gradeService.grade.scores[score.id] = score;
          delete props.gradeService.grade.unmatched[key];
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
      unmatchedNames,
      toBeMatched,
      studentsWithoutScore,
      skip,
      options,
      filterFn,
      setName
    };
  }
});
</script>
