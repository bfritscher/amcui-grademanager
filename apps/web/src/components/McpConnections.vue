<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { isAxiosError } from 'axios';
import { useApiStore } from '@/stores/api';

interface Connection {
  id: string;
  clientName: string;
  projects: string[];
  scopes: string[];
}

const api = useApiStore();
const available = ref(false);
const error = ref('');
const success = ref('');
const grants = ref<Connection[]>([]);
const loadingId = ref('');
const revokingId = ref('');
const editing = ref<Connection | null>(null);
const canCreate = computed(() => editing.value?.scopes.includes('exam:write') || false);
const editorOpen = ref(false);
const availableProjects = ref<string[]>([]);
const selected = ref<string[]>([]);
const search = ref('');
const saving = ref(false);
const saveError = ref('');
const busy = computed(() => !!loadingId.value || !!revokingId.value || saving.value);
const projectOptions = computed(() =>
  availableProjects.value
    .filter((project) => project.toLowerCase().includes(search.value.trim().toLowerCase()))
    .map((project) => ({ label: project, value: project }))
);
const unavailableCount = computed(
  () =>
    editing.value?.projects.filter((project) => !availableProjects.value.includes(project))
      .length || 0
);
const changed = computed(
  () =>
    editing.value &&
    (selected.value.length !== editing.value.projects.length ||
      selected.value.some((project) => !editing.value!.projects.includes(project)))
);

function errorMessage(cause: unknown, fallback: string) {
  return isAxiosError<{ error?: string }>(cause) && typeof cause.response?.data?.error === 'string'
    ? cause.response.data.error
    : fallback;
}

async function load() {
  try {
    grants.value = (await api.$http.get(`${api.URL}/profile/mcp/grants`)).data;
    available.value = true;
  } catch {
    /* MCP is optional on the server. */
  }
}
async function edit(connection: Connection) {
  if (busy.value) return;
  error.value = '';
  success.value = '';
  loadingId.value = connection.id;
  try {
    const { data } = await api.$http.get<{ grant: Connection; availableProjects: string[] }>(
      `${api.URL}/profile/mcp/grants/${encodeURIComponent(connection.id)}`
    );
    editing.value = data.grant;
    availableProjects.value = data.availableProjects;
    selected.value = data.grant.projects.filter((project) =>
      data.availableProjects.includes(project)
    );
    search.value = '';
    saveError.value = '';
    editorOpen.value = true;
  } catch (cause) {
    error.value = errorMessage(cause, 'Unable to load projects. Please try again.');
  } finally {
    loadingId.value = '';
  }
}

async function save() {
  if (
    !editing.value ||
    saving.value ||
    !changed.value ||
    (!selected.value.length && !canCreate.value) ||
    selected.value.length > 200
  )
    return;
  saving.value = true;
  saveError.value = '';
  try {
    const { data } = await api.$http.put<Connection>(
      `${api.URL}/profile/mcp/grants/${encodeURIComponent(editing.value.id)}/projects`,
      { projects: selected.value }
    );
    grants.value = grants.value.map((grant) => (grant.id === data.id ? data : grant));
    editorOpen.value = false;
    success.value = `Projects updated for ${data.clientName}. Ask your editor to list projects again; no reconnection is needed.`;
  } catch (cause) {
    saveError.value = errorMessage(
      cause,
      'Unable to save projects. Your changes have not been confirmed. Please try again.'
    );
  } finally {
    saving.value = false;
  }
}

async function revoke(id: string) {
  if (busy.value) return;
  error.value = '';
  success.value = '';
  revokingId.value = id;
  try {
    await api.$http.delete(`${api.URL}/profile/mcp/grants/${encodeURIComponent(id)}`);
    grants.value = grants.value.filter((grant) => grant.id !== id);
  } catch {
    error.value = 'Unable to revoke this connection.';
  } finally {
    revokingId.value = '';
  }
}
onMounted(load);
</script>
<template>
  <div v-if="available" class="row q-py-lg">
    <q-card flat bordered class="col-12 col-md-8 offset-md-2">
      <q-card-section>
        <div class="text-h5">Connected exam editors</div>
        <p class="q-mt-sm">
          Use Edit projects to give an editor access to a new project without reconnecting it.
          Editors with editing access can also create new projects and automatically access them.
        </p>
        <p v-if="!grants.length">No connected editors.</p>
        <q-list separator>
          <q-item v-for="grant in grants" :key="grant.id" class="q-px-none">
            <q-item-section>
              <q-item-label>{{ grant.clientName }}</q-item-label>
              <q-item-label caption class="connection-projects">
                {{ grant.projects.join(', ') || 'No projects selected' }}
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <div class="column items-end">
                <q-btn
                  flat
                  color="primary"
                  label="Edit projects"
                  :loading="loadingId === grant.id"
                  :disable="busy"
                  @click="edit(grant)"
                />
                <q-btn
                  flat
                  color="negative"
                  label="Revoke"
                  :loading="revokingId === grant.id"
                  :disable="busy"
                  @click="revoke(grant.id)"
                />
              </div>
            </q-item-section>
          </q-item>
        </q-list>
        <q-banner v-if="error" class="bg-red-1 text-negative q-mt-md" role="alert">
          {{ error }}
        </q-banner>
        <q-banner v-if="success" class="bg-green-1 text-positive q-mt-md" role="status">
          {{ success }}
        </q-banner>
      </q-card-section>
    </q-card>
    <q-dialog v-model="editorOpen" :persistent="saving">
      <q-card v-if="editing" style="width: 560px; max-width: 100%">
        <q-card-section>
          <h2 class="text-h6 q-my-none">Edit projects for {{ editing.clientName }}</h2>
          <p class="q-mt-sm">
            Choose the projects this editor may
            {{ editing.scopes.includes('exam:write') ? 'read and edit' : 'read' }}. Changes apply to
            its next request. No reconnection is needed.
          </p>
          <q-input v-model="search" outlined dense label="Search projects" :disable="saving" />
          <div class="q-my-md project-options">
            <q-option-group
              v-if="projectOptions.length"
              v-model="selected"
              type="checkbox"
              :options="projectOptions"
              :disable="saving"
            />
            <p v-else>
              {{
                availableProjects.length
                  ? 'No matching projects.'
                  : 'No projects are currently available to your account.'
              }}
            </p>
          </div>
          <p class="text-caption">
            {{ selected.length }} selected.
            {{
              canCreate
                ? 'Select up to 200 projects. An empty selection still allows this editor to create and access new projects.'
                : 'Select between 1 and 200 projects.'
            }}
            Use Revoke to disconnect this editor entirely.
          </p>
          <p v-if="unavailableCount" class="text-warning">
            {{ unavailableCount }} previously selected project(s) are no longer available and will
            be removed when you save.
          </p>
          <q-banner v-if="saveError" class="bg-red-1 text-negative" role="alert">
            {{ saveError }}
          </q-banner>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" :disable="saving" @click="editorOpen = false" />
          <q-btn
            color="primary"
            label="Save projects"
            :loading="saving"
            :disable="
              saving || !changed || (!selected.length && !canCreate) || selected.length > 200
            "
            @click="save"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped>
.connection-projects,
.project-options {
  overflow-wrap: anywhere;
}
.project-options {
  max-height: 40vh;
  overflow-y: auto;
}
</style>
