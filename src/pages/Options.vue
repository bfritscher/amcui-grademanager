<template>
  <q-page padding>
    <h2 class="text-h5">Collaborators</h2>
    <q-select
      :model-value="API.options.users"
      placeholder="add username"
      use-input
      use-chips
      multiple
      hide-dropdown-icon
      input-debounce="0"
      new-value-mode="add-unique"
      @add="addUser"
      @remove="removeUser"
    />
    <h2 class="text-h5">Raw exports</h2>
    <div>
      <q-btn color="primary" class="q-mr-lg" @click="downloadFromUrl(API.downloadURL())"
        >Download&nbsp;<small>project.zip</small>
      </q-btn>

      <q-btn color="primary" class="q-mr-lg" @click="downloadFromUrl(API.downloadODSURL())"
        >Download&nbsp;<small>export.ods</small>
      </q-btn>

      <q-btn color="primary" @click="downloadFromUrl(API.downloadCSVURL())"
        >Download&nbsp;<small>students.csv</small>
      </q-btn>
    </div>

    <h2 class="text-h5">Options</h2>

    <h3 class="text-h6">Print</h3>
    <q-input
      v-model="API.options.options.nombre_copies"
      label="Nb of copies"
      type="number"
      @blur="saveOptions()"
    />
    <q-checkbox
      label="Print answersheet in separate file."
      true-value="1"
      false-value="0"
      :model-value="API.options.options.split === '1' ? '1' : '0'"
      @update:model-value="updateSplit"
    >
    </q-checkbox>

    <h3 class="text-h6">Scan</h3>
    <p>
      Threshold: {{ Math.round(parseFloat(API.options.options.seuil) * 100) }}% black filled
      <q-slider
        label-always
        :step="0.05"
        :min="0"
        :max="1"
        :model-value="parseFloat(API.options.options.seuil)"
        @update:model-value="updateThreshold"
      >
      </q-slider>
      When one uses a separate answer sheet, letters or digits use at least 0.5.
    </p>

    <p>
      <b>Type of scans</b>
      <q-select
        v-model="API.options.options.auto_capture_mode"
        :options="API.typeOfScan"
        map-options
        emit-value
        disable
      ></q-select>
    </p>

    <h3 class="text-h6">Annotation</h3>
    <q-input
      v-model="API.options.options.modele_regroupement"
      label="Annotation filename pattern"
      @blur="saveOptions()"
    ></q-input>
    <p>
      (ID) is replaced by the student's name.<br />
      (N) is replaced by the student's number.<br />
      (<i>COLNAME</i>) any other column name in the student.csv
    </p>

    <div>
      Click to add:
      <q-chip v-for="field in fields" :key="field" clickable @click="addColToFileName(field)">{{
        field
      }}</q-chip>
    </div>

    <q-input
      v-model="API.options.options.verdict"
      label="Annotation"
      type="textarea"
      @blur="saveOptions()"
    />

    <p>
      %(ID) is replaced by the student's name.<br />
      %(COLNAME) is replaced by the value of column COLNAME in the students list for the current
      student.<br />
      %S is replaced by the student's total score.<br />
      %M is replaced by the maximum total score.<br />
      %s is replaced by the student's mark.<br />
      %m is replaced by the maximum mark.
    </p>

    <div>
      Click to add:
      <q-chip v-for="field in fields" :key="field" clickable @click="addColToAnnotation(field)">{{
        field
      }}</q-chip>
    </div>

    <h4 class="text-h6">Annotation marks</h4>
    <q-markup-table flat dense>
      <thead>
        <tr class="bg-secondary">
          <th>Preview</th>
          <th>To be ticked</th>
          <th>Ticked</th>
          <th>Type</th>
          <th>Color</th>
        </tr>
      </thead>
      <tbody>
        <annotation-marks
          :value="API.options.options"
          :to-be-ticked="false"
          :ticked="false"
          @change="saveOptions()"
        ></annotation-marks>
        <annotation-marks
          :value="API.options.options"
          :to-be-ticked="false"
          :ticked="true"
          @change="saveOptions()"
        ></annotation-marks>
        <annotation-marks
          :value="API.options.options"
          :to-be-ticked="true"
          :ticked="false"
          @change="saveOptions()"
        ></annotation-marks>
        <annotation-marks
          :value="API.options.options"
          :to-be-ticked="true"
          :ticked="true"
          @change="saveOptions()"
        ></annotation-marks>
      </tbody>
    </q-markup-table>

    <q-toggle
      v-model="showAllOptions"
      label="Display all options"
      class="text-h5 q-mt-xl"
      left-label
      color="primary"
    />

    <div v-if="showAllOptions">
      <q-input
        v-for="(value, key) in API.options.options"
        :key="key"
        v-model="API.options.options[key]"
        :label="String(key)"
        :type="['verdict', 'email_text'].includes(String(key)) ? 'textarea' : 'text'"
        @blur="saveOptions()"
      />
    </div>

    <h2 class="text-h5">Advanced</h2>
    <p>
      <q-btn class="q-mr-lg" color="primary" @click="downloadFromUrl(API.scoringURL())"
        >Scoring&nbsp;<small>(force redo)</small>
      </q-btn>
      <q-btn class="q-mr-lg" color="primary" @click="downloadFromUrl(API.markURL())"
        >Marking&nbsp;<small>(force redo)</small>
      </q-btn>
      <q-btn color="warning" class="q-mr-lg" @click="downloadFromUrl(API.resetLockURL())"
        >Reset&nbsp;<small>project's server locks</small>
      </q-btn>
      <q-btn class="q-mr-lg" color="primary" @click="downloadFromUrl(API.dbVersionsURL())"
        >DB versions
      </q-btn>
      <q-btn class="q-mr-lg" color="primary" @click="renameProject()">Rename project </q-btn>
      <q-btn color="negative" @click="deleteProject()">Delete project! </q-btn>
    </p>
    <q-uploader
        class="q-mr-lg"
        accept=".zip"
        auto-upload
        hide-upload-btn
        label="Upload project.zip"
        :factory="uploadFactory"
        @uploaded="handleImportSuccess"
      />
  </q-page>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { useRouter } from 'vue-router';
import AnnotationMarks from '../components/Options/AnnotationMarks.vue';
import { useApiStore } from '@/stores/api';
import { useStore } from '@/stores/store';
import { useExamStore } from '@/stores/exam';

export default defineComponent({
  name: 'Options',
  components: {
    AnnotationMarks
  },
  setup() {
    const API = useApiStore();
    const router = useRouter();
    const store = useStore();
    const examStore = useExamStore();
    const $q = useQuasar();
    const showAllOptions = ref(false);
    const fields = ref<string[]>([]);
    onMounted(async () => {
      API.loadOptions();
      fields.value = await (API.getCsvFields() as Promise<string[]>);
    });

    const saveOptions = () => {
      API.saveOptions().then(
        () => {
          $q.notify({
            type: 'positive',
            message: 'Options saved!',
            position: 'top-right'
          });
        },
        (err) => {
          $q.notify({
            type: 'negative',
            message: err.message,
            position: 'top-right'
          });
        }
      );
    };

    return {
      API,
      showAllOptions,
      fields,
      saveOptions,
      async addUser({ value }: { value: string; index: number }) {
        await API.addUser(value, API.project);
        API.options.users.push(value);
      },
      async removeUser({ value, index }: { value: string; index: number }) {
        if (value === store.user?.username) return;
        await API.removeUser(value, API.project);
        API.options.users.splice(index, 1);
      },
      updateSplit(value: string) {
        API.options.options.split = value;
        saveOptions();
      },
      updateThreshold(value: number | null) {
        if (value === null) return;
        API.options.options.seuil = value.toString();
        saveOptions();
      },
      downloadFromUrl(url: string) {
        window.open(url);
      },
      addColToFileName(name: string) {
        API.options.options.modele_regroupement += ` (${name})`;
        saveOptions();
      },
      addColToAnnotation(name: string) {
        API.options.options.verdict += ` %(${name})`;
        saveOptions();
      },
      deleteProject() {
        $q.dialog({
          title: 'Confirm project deletion!',
          message: `Are you sure you want to delete all data of ${API.project}?`,
          persistent: true,
          ok: {
            label: 'Delete everything!',
            color: 'negative',
            flat: true
          },
          cancel: 'Cancel'
        }).onOk(() => {
          API.deleteProject().then(() => {
            router.push({ name: 'Home' });
          });
        });
      },
      renameProject() {
        let name = prompt('Rename project to', API.project);
        if (name) {
          API.renameProject(name).then((apiName) => {
            router.push({
              name: 'Options',
              params: { project: apiName }
            });
          });
        }
      },
      uploadFactory() {
        return {
          url: `${API.URL}/project/${API.project}/zip`,
          headers: [
            {
              name: 'Authorization',
              value: `Bearer ${store.token}`
            }
          ],
          fieldName: 'file'
        };
      },
      handleImportSuccess(response: any) {
        console.log(response);
        examStore.importJSON(response.xhr.response);
        router.push({ name: 'Edit', params: { project: API.project } });
        $q.notify({
          type: 'positive',
          message: 'Project imported!',
          position: 'center'
        });
      }
    };
  }
});
</script>
