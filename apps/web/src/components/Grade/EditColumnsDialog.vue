<template>
  <q-dialog ref="dialogRef" :maximized="$q.screen.lt.sm" persistent @hide="onDialogHide">
    <q-card class="q-dialog-plugin">
      <q-toolbar class="bg-primary text-white">
        <q-toolbar-title> Edit Columns </q-toolbar-title>
        <q-btn flat round dense icon="sym_o_close" @click="onDialogOK" />
      </q-toolbar>
      <q-card-section>
        <draggable v-model="list" item-key="index" handle=".drag-handle">
          <template #item="{ element }">
            <div>
              <q-input
                :model-value="element.value"
                debounce="1000"
                :readonly="element.locked"
                @update:model-value="renameColumn(element.value, $event)"
              >
                <template #before>
                  <q-icon name="sym_o_drag_pan" class="text-grey-7 drag-handle" size="sm" />
                </template>
                <template #after>
                  <q-btn
                    flat
                    padding="xs"
                    size="md"
                    icon="sym_o_close"
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
        <q-btn flat label="add column" @click="addColumn" />
        <q-space />
        <q-btn color="primary" flat label="close" @click="onDialogOK" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { useDialogPluginComponent, useQuasar } from 'quasar';
import draggable from 'vuedraggable';
import GradeService from '../../services/grade';
import { defineComponent, type PropType, computed } from 'vue';

interface Ifield {
  index: number;
  value: string;
  locked: boolean;
}

export default defineComponent({
  name: 'EditColumnsDialog',
  components: {
    draggable
  },
  props: {
    fields: {
      type: Array as PropType<string[]>,
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

    const $q = useQuasar();

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
        props.fields.splice(0, props.fields.length, ...orderedList.map((o) => o.value));
        props.gradeService.debounceSaveCSV();
      }
    });

    return {
      dialogRef,
      onDialogHide,
      onDialogOK,
      list,
      renameColumn(col: string, newName: string | number | null) {
        if (!newName || col === 'id') return;
        if (
          props.gradeService.renameColumn(
            col,
            String(newName),
            props.gradeService.grade.students.fields,
            props.gradeService.grade.students.data
          )
        ) {
          props.gradeService.calculateGrades();
        }
      },
      removeColumn(col: string) {
        if (col !== 'id') {
          const index = props.gradeService.grade.students.fields.indexOf(col);
          props.gradeService.grade.students.fields.splice(index, 1);
          props.gradeService.calculateGrades();
        }
      },
      addColumn() {
        $q.dialog({
          title: 'Add Column',
          message: 'Provide a name for the new column',
          prompt: {
            label: 'New name',
            model: '',
            type: 'text' // optional
          },
          cancel: true,
          persistent: true
        }).onOk((name: string) => {
          name = name.trim();
          props.gradeService.grade.students.fields.push(name);
          props.gradeService.calculateGrades();
        });
      }
    };
  }
});
</script>
<style scoped>
.sym_o_drag_pan.q-icon {
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
