<template>
  <div class="bg-secondary shadow-1 q-mb-sm">
    <div class="row q-pa-md items-center">
      <q-input
        :model-value="file.studentLookup"
        label="StudentLookup"
        debounce="1000"
        class="col"
        @update:model-value="updateOnBlur('studentLookup', $event)"
      ></q-input>
      <q-select
        :model-value="file.demoid"
        class="q-mx-md"
        label="test student id"
        debounce="1000"
        use-input
        new-value-mode="add-unique"
        :behavior="$q.platform.is.ios === true ? 'dialog' : 'menu'"
        :options="studentIds"
        @update:model-value="updateOnBlur('demoid', $event)"
      ></q-select>
      <div style="min-width: 200px;">
        {{ demoStudent() }}
      </div>
    </div>
    <div class="row q-pb-md q-px-md">
      <q-input
        :model-value="file.fileLookup"
        label="CurrentFileLookup"
        debounce="1000"
        class="col"
        @update:model-value="updateOnBlur('fileLookup', $event)"
      ></q-input>
      <q-btn color="negative" flat @click="$emit('importCols')"
        >import selected columns</q-btn
      >
    </div>
  </div>
  <q-markup-table dense flat class="my-table">
    <thead>
      <tr>
        <th class="text-no-wrap">Student Match</th>
        <th class="text-no-wrap">Lookup Value</th>
        <th v-for="(key, index) in file.meta.fields" :key="index">
          <div class="row">
            <q-checkbox
              :model-value="!!file.meta.selected[index]"
              :label="key"
              color="primary"
              @update:model-value="file.meta.selected[index]= $event;gradeService.saveFiles()"
            ></q-checkbox>
            <q-btn
              flat
              size="md"
              padding="xs"
              icon="mdi-pencil"
              @click.prevent.stop=""
            >
              <q-popup-edit
                :model-value="key"
                title="Rename column"
                buttons
                @update:model-value="renameColumn(key, $event)"
              >
                <template #="scope">
                  <div class="row">
                    <q-input
                      v-model="scope.value"
                      type="text"
                      dense
                      autofocus
                      @keyup.enter="scope.set"
                      @keyup.esc="scope.cancel"
                    />
                    <q-btn
                      flat
                      padding="xs"
                      size="md"
                      icon="mdi-close"
                      color="negative"
                      label="Delete"
                      @click="removeColumn(index)"
                    >
                    </q-btn>
                  </div>
                </template>
              </q-popup-edit>
            </q-btn>
          </div>
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(row, index) in file.data" :key="index">
        <td>
          {{ lookup(row, file.fileLookup, file.studentLookup).join(', ') }}
        </td>
        <td>
          {{ gradeService.makeFunc(file.fileLookup)(row) }}
        </td>
        <td
          v-for="key in file.meta.fields"
          :key="key"
          :class="{ 'text-right': !isNaN(row[key]) }"
        >
          {{ row[key] }}
          <q-popup-edit
            v-model="row[key]"
            buttons
            @update:model-value="gradeService.saveFiles()"
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
        </td>
      </tr>
    </tbody>
  </q-markup-table>
  <q-separator />
  <q-btn color="negative" class="q-ma-md" @click="$emit('removeFile')">Remove file</q-btn>
</template>
<script lang="ts">
import { useQuasar } from 'quasar';
import { defineComponent, inject, PropType, computed } from 'vue';

import GradeService from '../../services/grade';
import { GradeFile } from '../models';

export default defineComponent({
  name: 'GradeFile',
  props: {
    file: {
      type: Object as PropType<GradeFile>,
      required: true,
    },
  },
  emits: ['importCols', 'removeFile'],
  setup(props) {
    const gradeService = inject('gradeService') as GradeService;
    const $q = useQuasar();

    const studentIds = computed(() => gradeService.grade.students.data.map((o) => o.id));

    return {
      gradeService,
      studentIds,
      renameColumn(key: string, newName: string) {
        if (
          gradeService.renameColumn(
            key,
            newName,
            props.file.meta.fields,
            props.file.data
          )
        ) {
          gradeService.saveFiles();
        }
      },
      removeColumn(index: number) {
        $q.dialog({
          title: 'Confirm delete',
          message: `Remove column ${props.file.meta.fields[index]}`,
          persistent: true,
          ok: 'Remove',
          cancel: 'Cancel',
        }).onOk(() => {
          props.file.meta.fields.splice(index, 1);
          gradeService.saveFiles();
        });
      },
      updateOnBlur(name: string, value: string) {
        (props.file as any)[name] = value;
        gradeService.saveFiles();
      },
      lookup(row: any, fileLookup: string, studentLookup: string) {
        const lookupValue = gradeService.makeFunc(fileLookup)(row);
        const matches = [] as string[];
        if (lookupValue) {
          const studentLookupFunc = gradeService.makeFunc(studentLookup);
          gradeService.grade.students.data.forEach((studentRow) => {
            if (studentLookupFunc(studentRow) === lookupValue) {
              matches.push(String(studentRow.id));
            }
          });
        }
        return matches;
      },
      demoStudent() {
        const student = gradeService.getStudentById(props.file.demoid);
        if (!student) {
          return 'Student not found';
        }
        const value = gradeService.makeFunc(props.file.studentLookup)(student);
        return value || 'No value';
      },
    };
  },
});
</script>
<style>
.my-table .q-table {
  width: unset;
  border-spacing: 4px 0;
}
</style>
