<template>
  <q-page class="container">
    <q-form ref="form.ref" class="row q-py-lg" @submit="createProject">
      <q-card class="col-12 col-md-8 offset-md-2">
        <q-card-section>
          <div class="text-h5">New Project</div>
          <div class="row items-center no-wrap">
            <q-input
              v-model="form.projectName"
              class="col-8 offset-md-1"
              label="Project name"
              :rules="form.projectNameRules"
              required
            ></q-input>
            <q-btn type="submit" color="primary" unelevated
              >Create Project</q-btn
            >
          </div>
        </q-card-section>
        <q-card-section v-if="form.error">
          <p class="text-red">{{ form.error }}</p>
        </q-card-section>
      </q-card>
    </q-form>
    <div class="row q-py-lg">
      <q-card class="col-12 col-md-8 offset-md-2">
        <q-card-section>
          <div class="text-h5">Existing Projects</div>

          <q-input
            v-model="search"
            label="Search"
            @click="selectedTab = 'all'"
          >
            <template #append>
              <q-icon
                v-if="search !== ''"
                name="close"
                class="cursor-pointer"
                @click="search = ''"
              />
              <q-icon name="search" />
            </template>
          </q-input>
        </q-card-section>

        <q-tabs
          v-model="selectedTab"
          :breakpoint="0"
          align="justify"
          inline-label
          class="text-grey-8"
          active-color="primary"
          indicator-color="primary"
        >
          <q-tab label="Recent" name="recent" />
          <q-tab label="All" name="all" />
        </q-tabs>

        <q-separator />
        <q-tab-panels v-model="selectedTab" animated swipeable>
          <q-tab-panel name="recent" class="q-pa-none">
            <home-table
              :items="filteredProjects"
              @copy-project="copyProject"
              @open-project="openProject"
            ></home-table>
          </q-tab-panel>
          <q-tab-panel name="all" class="q-pa-none">
            <home-table
              group="prefix"
              :items="filteredProjects"
              @copy-project="copyProject"
              @open-project="openProject"
            ></home-table>
          </q-tab-panel>
        </q-tab-panels>
      </q-card>
    </div>
    <a
      :href="`https://github.com/bfritscher/grademanager/commit/${COMMITHASH}`"
      class="git-version"
      >v: {{ COMMITHASH.slice(0, 7) }}</a
    >
  </q-page>
</template>

<script lang="ts">
import {
  defineComponent,
  onMounted,
  inject,
  ref,
  computed,
  reactive,
} from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useStore } from '../store';
import Api from '../services/api';
import { Project } from '../components/models';
import HomeTable from '../components/Home/HomeTable.vue';

export default defineComponent({
  name: 'Home',
  components: {
    HomeTable,
  },
  setup() {
    const API = inject('API') as Api;
    const router = useRouter();
    const store = useStore();
    const $q = useQuasar();

    onMounted(() => {
      API.project = '';
      API.getProjectList();
    });

    const form = reactive({
      ref: null as any,
      error: '',
      projectName: '',
      projectNameRules: [
        (value: string) => !!value || 'Name is required',
        (value: string) =>
          /^[-0-9a-z_]+$/.test(value) ||
          'Only the following characters are allowed: 0-9a-z-_',
      ],
    });

    const selectedTab = ref('recent');
    const search = ref('');

    const filteredProjects = computed(() => {
      return (
        selectedTab.value === 'recent'
          ? store.state.projectsRecent
          : store.state.projects
      ).filter((p) =>
        p.project.toLowerCase().includes(search.value.toLowerCase())
      );
    });

    const openProject = (
      project: Project | { project: string; status?: any }
    ) => {
      const route = {
        name: 'Edit',
        params: {
          project: project.project,
        },
      };
      if (project.status && project.status.annotated) {
        route.name = 'Grade';
      } else if (project.status && project.status.printed) {
        route.name = 'Scan';
      }
      router.push(route);
    };

    return {
      form,
      selectedTab,
      search,
      filteredProjects,
      COMMITHASH: process.env.COMMITHASH || '',
      openProject,
      createProject() {
        form.error = '';
        form.projectName = form.projectName.trim().toLowerCase();
        API.createProject(form.projectName).then(
          (r: any) => {
            openProject({ project: r.data });
          },
          (data) => {
            form.error = data.data || data;
          }
        );
      },
      copyProject(project: Project) {
        $q.dialog({
          title: `Copy project ${project.project}`,
          message: 'Provide a name for the new copy:',
          prompt: {
            label: 'New name',
            model: '',
            type: 'text', // optional
          },
          cancel: true,
          persistent: true,
        }).onOk((name: string) => {
          name = name
            .trim()
            .toLowerCase()
            .replace(/[^\-a-z0-9\_]/g, '');
          API.copyProject(project.project, name).then(() => {
            openProject({ project: name });
          });
        });
      },
    };
  },
});
</script>
<style scoped>
.git-version {
  position: fixed;
  bottom: 4px;
  right: 20px;
  color: #999;
  font-size: 8px;
  text-decoration: none;
}

.min-width {
  min-width: 600px;
}
</style>
