<template>
  <q-page>
    <q-tabs v-model="selectedTab" :breakpoint="0" align="left" inline-label>
      <q-tab label="Projects" name="projects" />
      <q-tab label="Users" name="users" />
    </q-tabs>
    <q-separator />
    <q-tab-panels v-model="selectedTab" animated swipeable>
      <q-tab-panel name="projects" class="q-pa-none">
        <q-table
          :title="`Projects (${tables.projects.length})`"
          :columns="tables.columnsProjects"
          :rows="tables.projects"
          :filter="tables.filterProjects"
          row-key="name"
          :loading="tables.loading"
          :pagination="tables.initialPaginationProjects"
          wrap-cells
        >
          <template #top-right>
            <q-input
              v-model="tables.filterProjects"
              borderless
              dense
              debounce="300"
              placeholder="Search"
            >
              <template #append>
                <q-icon name="search" />
              </template>
            </q-input>
          </template>
          <template #body-cell-size="props">
            <q-td :props="props" @click="props.row.detail = !props.row.detail">
              <span
                v-if="props.row.error === ERROR_NO_FOLDER"
                class="text-red"
                >{{ ERROR_NO_FOLDER }}</span
              >
              <span v-else>
                {{ (props.row.size / 1024).toFixed(1) }}
              </span>
              <div v-if="props.row.detail">
                <div v-for="f in props.row.folders" :key="f">
                  <div v-for="(v, k) in f" :key="k">
                    <span class="text-left">{{ k }}</span
                    >:
                    <span>{{ (v / 1024).toFixed(1) }}</span>
                  </div>
                </div>
              </div>
            </q-td>
          </template>

          <template #body-cell-users="props">
            <q-td :props="props">
              {{ props.row.users.join(', ') }}
            </q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props">
              <span v-if="props.row.error == ERROR_NOT_IN_DB"
                >{{ ERROR_NOT_IN_DB }}
                <q-btn @click="importProject(props.row)">Import</q-btn>
              </span>
              <q-btn
                v-if="props.row.users.indexOf($store.state.user.username) < 0"
                size="sm"
                @click="addToProject(props.row)"
                >add self</q-btn
              >
              <q-btn
                v-if="props.row.users.indexOf($store.state.user.username) > -1"
                size="sm"
                @click="removeFromProject(props.row)"
                >remove self</q-btn
              >
              <q-btn
                v-if="props.row.error !== ERROR_NO_FOLDER"
                color="warning"
                size="sm"
                @click="gitgcProject(props.row)"
                >git gc</q-btn
              >
              <q-btn
                color="negative"
                size="sm"
                @click="deleteProject(props.row)"
                >Delete</q-btn
              >
            </q-td>
          </template>
        </q-table>
      </q-tab-panel>
      <q-tab-panel name="users" class="q-pa-none">
        <q-table
          :title="`Users (${tables.users.length})`"
          :columns="tables.columnsUsers"
          :rows="tables.users"
          :filter="tables.filterUsers"
          row-key="name"
          :loading="tables.loading"
          :pagination="tables.initialPaginationUsers"
          wrap-cells
        >
          <template #top-right>
            <q-input
              v-model="tables.filterUsers"
              borderless
              dense
              debounce="300"
              placeholder="Search"
            >
              <template #append>
                <q-icon name="search" />
              </template>
            </q-input>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props">
              <q-btn color="warning" size="sm" @click="removeMfa(props.row)"
                >remove MFA</q-btn
              >
              <q-btn
                color="warning"
                size="sm"
                @click="changePassword(props.row)"
                >change password</q-btn
              >
              <q-btn color="negative" size="sm" @click="deleteUser(props.row)"
                >Delete</q-btn
              >
            </q-td>
          </template>
        </q-table>
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>
<script lang="ts">
import {
  AdminDu,
  AdminProject,
  AdminStats,
  AdminUser,
} from 'src/components/models';
import { defineComponent, ref, reactive, inject, onMounted } from 'vue';
import Api from '../services/api';

export default defineComponent({
  name: 'Admin',
  setup() {
    const API = inject('API') as Api;
    const selectedTab = ref('projects');

    const tables = reactive({
      users: [] as AdminUser[],
      projects: [] as AdminProject[],
      stats: {} as AdminStats,
      loading: true,
      filterProjects: '',
      initialPaginationProjects: {
        sortBy: 'name',
        descending: false,
        rowsPerPage: 50,
      },
      columnsProjects: [
        {
          name: 'name',
          label: 'Name',
          align: 'left',
          field: 'name',
          sortable: true,
        },
        {
          name: 'size',
          label: 'Size (Mb)',
          align: 'right',
          field: 'size',
          sortable: true,
        },
        {
          name: 'commits',
          label: 'Commits',
          align: 'right',
          field: 'commits',
          sortable: true,
        },
        {
          name: 'students',
          label: 'Students',
          align: 'right',
          field: 'students',
          sortable: true,
        },
        {
          name: 'nbUsers',
          label: 'Nb',
          align: 'right',
          field: (row: any) => row.users.length,
          sortable: true,
        },
        {
          name: 'users',
          label: 'Users',
          align: 'left',
          field: 'users',
          sortable: false,
        },
        {
          name: 'actions',
          label: 'Actions',
          align: 'left',
          field: 'users',
          sortable: false,
        },
      ],
      filterUsers: '',
      initialPaginationUsers: {
        sortBy: 'username',
        descending: false,
        rowsPerPage: 50,
      },
      columnsUsers: [
        {
          name: 'username',
          label: 'Username',
          align: 'left',
          field: 'username',
          sortable: true,
        },
        {
          name: 'nbProjects',
          label: 'Nb',
          align: 'right',
          field: (row: any) => row.projects.length,
          sortable: true,
        },
        {
          name: 'projects',
          label: 'Projects',
          align: 'left',
          field: 'projects',
          format: (val: string[]) => val.join(', '),
          sortable: false,
        },
        {
          name: 'actions',
          label: 'Actions',
          align: 'left',
          field: 'projects',
          sortable: false,
        },
      ],
    });

    const ERROR_NO_FOLDER = 'Project has no folder!';
    const ERROR_NOT_IN_DB = 'Project not in DB!';

    function loadData() {
      tables.users = [];
      tables.projects = [];
      tables.loading = true;
      API.$http.get(API.URL + '/admin/stats').then((res) => {
        tables.stats = res.data;
        Object.keys(tables.stats.projects).forEach((k) => {
          const project = tables.stats.projects[k];
          project.name = k;
          project.users = [];
          project.detail = false;
          tables.projects.push(project);
        });

        Object.keys(tables.stats.users || {}).forEach((u) => {
          tables.stats.users[u].forEach((p) => {
            if (!tables.stats.projects[p]) {
              console.log('not found', p, 'for', u);
              return;
            }
            tables.stats.projects[p].users.push(u);
          });
          tables.users.push({
            username: u,
            projects: tables.stats.users[u].sort(),
          });
        });
        tables.projects.forEach((p) => {
          p.users.sort();
        });
        API.$http.get(API.URL + '/admin/du').then((res) => {
          const data = res.data as AdminDu;
          Object.keys(data).forEach((p) => {
            if (!tables.stats.projects.hasOwnProperty(p)) {
              const project = {
                name: p,
                students: -1,
                commits: -1,
                users: [],
                error: ERROR_NOT_IN_DB,
                size: -1,
                folders: [],
              };
              tables.stats.projects[p] = project;
              tables.projects.push(project);
            }
            tables.stats.projects[p].size = data[p].total;
            tables.stats.projects[p].folders = data[p].folders;
          });
          tables.projects.forEach((p) => {
            if (!data.hasOwnProperty(p.name)) {
              p.error = ERROR_NO_FOLDER;
            }
          });
          tables.loading = false;
        });
      });
    }

    onMounted(() => {
      loadData();
    });

    return {
      selectedTab,
      tables,
      ERROR_NO_FOLDER,
      ERROR_NOT_IN_DB,
      importProject(project: AdminProject) {
        API.$http.post(API.URL + '/admin/import', { project: project.name });
        loadData();
      },
      addToProject(project: AdminProject) {
        API.$http.post(API.URL + '/admin/addtoproject', {
          project: project.name,
        });
        loadData();
      },
      removeFromProject(project: AdminProject) {
        API.$http.post(API.URL + '/admin/removefromproject', {
          project: project.name,
        });
        loadData();
      },
      deleteProject(project: AdminProject) {
        if (confirm(`Delete project ${project.name}`)) {
          API.$http
            .post(`${API.URL}/admin/project/${project.name}/delete`)
            .then(() => {
              tables.projects.splice(tables.projects.indexOf(project), 1);
            });
        }
      },
      gitgcProject(project: AdminProject) {
        API.$http.post(`${API.URL}/admin/project/${project.name}/gitgc`);
      },
      deleteUser(user: AdminUser) {
        if (confirm(`Delete user ${user.username}`)) {
          API.$http
            .post(`${API.URL}/admin/user/${user.username}/delete`)
            .then(() => {
              tables.users.splice(tables.users.indexOf(user), 1);
            });
        }
      },
      removeMfa(user: AdminUser) {
        API.$http
          .post(`${API.URL}/admin/user/${user.username}/removemfa`)
          .then(() => {
            alert('done');
          });
      },
      changePassword(user: AdminUser) {
        API.$http
          .post(`${API.URL}/admin/user/${user.username}/changepassword`, {
            newPassword: prompt('New password?'),
          })
          .then(() => {
            alert('done');
          });
      },
    };
  },
});
</script>
