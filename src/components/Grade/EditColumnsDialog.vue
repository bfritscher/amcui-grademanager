<template>
  <q-dialog
    ref="dialogRef"
    :maximized="$q.screen.lt.sm"
    persistent
    @hide="onDialogHide"
  >
    <q-card class="q-dialog-plugin">
      <q-toolbar class="bg-primary text-white">
        <q-toolbar-title> Edit Columns </q-toolbar-title>
        <q-btn flat round dense icon="mdi-close" @click="onDialogOK" />
      </q-toolbar>
      <q-card-section>
        <draggable v-model="list" item-key="index" handle=".mdi-cursor-move">
          <template #item="{ element }">
            <div>
              <q-input
:model-value="element.value"
                debounce="1000"
                :readonly="element.locked"
                @update:model-value="renameColumn(element.value, $event)"
              >
                <template #before>
                  <q-icon
                    name="mdi-cursor-move"
                    class="text-grey-7"
                    size="sm"
                  />
                </template>
                <template #after>
                  <q-btn
                    flat
                    padding="xs"
                    size="md"
                    icon="mdi-close"
                    color="negative"
                    label="Delete"
                    :disable="element.locked"
                    @click="removeColumn(element.value)"
                  >
                  </q-btn>
                </template>
              </q-input>
            </div>
          </template>
        </draggable>
      </q-card-section>
      <q-card-actions align="right">
        <q-space />
        <q-btn color="primary" flat label="close" @click="onDialogOK" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { useDialogPluginComponent } from 'quasar';
import draggable from 'vuedraggable';
import GradeService from '../../services/grade';
import {
  defineComponent,
  inject,
  PropType,
  computed,
} from 'vue';

interface Ifield {
  index: number;
  value: string;
  locked: boolean;
}

export default defineComponent({
  name: 'EditColumnsDialog',
  components: {
    draggable,
  },
  props: {
    fields: {
      type: Array as PropType<string[]>,
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
    const gradeService = inject('gradeService') as GradeService;

    const list = computed({
      get(): Ifield[] {
        return props.fields.map((value, index) => {
          return {
            index,
            value,
            locked: ['id', 'Total', 'FinalGrade', 'Grade'].includes(value)
          };
        });
      },
      set(orderedList: Ifield[]) {
        props.fields.splice(
          0,
          props.fields.length,
          ...orderedList.map((o) => o.value)
        );
        gradeService.debounceSaveCSV();
      },
    });

    return {
      dialogRef,
      onDialogHide,
      onDialogOK,
      list,
      renameColumn(col: string, newName: string) {
        if(!newName || col === 'id') return;
        if (
          gradeService.renameColumn(
            col,
            newName,
            gradeService.grade.students.fields,
            gradeService.grade.students.data
          )
        ) {
          gradeService.calculateGrades();
        }
      },      
      removeColumn(col: string) {
        if (col !== 'id') {
          const index = gradeService.grade.students.fields.indexOf(col);
          gradeService.grade.students.fields.splice(index, 1);
          gradeService.calculateGrades();
        }
      },
    };
  },
});
</script>
<style scoped>
.mdi-cursor-move.q-icon {
  cursor: move;
}
</style>
<style>
.sortable-ghost {
  background: #f0f9ff;
  border: 2px dashed #bed2db;
  color: #f0f9ff;
}
.sortable-drag {
  background-color: white;
}
</style>
