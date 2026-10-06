<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { isAxiosError } from 'axios';
import { useApiStore } from '@/stores/api';

interface Connection {
  id: string;
  clientName: string;
  projects: string[];
  scopes: string[];
}

const props = defineProps<{ projectId: string }>();
const api = useApiStore();
const available = ref(false);
const connections = ref<Connection[]>([]);
const dialogOpen = ref(false);
const loading = ref(false);
const savingId = ref('');
const error = ref('');
const success = ref('');

async function load(initial = false) {
  loading.value = true;
  error.value = '';
  try {
    connections.value = (await api.$http.get(`${api.URL}/profile/mcp/grants`)).data;
    available.value = true;
  } catch {
    if (!initial) error.value = 'Unable to load editor connections. Please try again.';
  } finally {
    loading.value = false;
  }
}

async function open() {
  dialogOpen.value = true;
  success.value = '';
  await load();
}

async function add(connection: Connection) {
  if (savingId.value || loading.value) return;
  savingId.value = connection.id;
  error.value = '';
  success.value = '';
  const project = props.projectId;
  try {
    const { data } = await api.$http.post<Connection>(
      `${api.URL}/profile/mcp/grants/${encodeURIComponent(connection.id)}/projects`,
      { projectId: project }
    );
    connections.value = connections.value.map((item) => (item.id === data.id ? data : item));
    success.value = `Access to ${project} added for ${data.clientName}. Ask your editor to list projects again; no reconnection is needed.`;
  } catch (cause) {
    error.value =
      isAxiosError<{ error?: string }>(cause) && typeof cause.response?.data?.error === 'string'
        ? cause.response.data.error
        : 'Unable to add access. Please try again.';
  } finally {
    savingId.value = '';
  }
}

watch(
  () => props.projectId,
  () => {
    dialogOpen.value = false;
    success.value = '';
    error.value = '';
  }
);
onMounted(() => load(true));
</script>

<template>
  <q-btn v-if="available" outline color="primary" label="Add editor access" @click="open" />
  <q-dialog v-model="dialogOpen" :persistent="!!savingId">
    <q-card style="width: 560px; max-width: 100%">
      <q-card-section>
        <h2 class="text-h6 q-my-none">Give an editor access to {{ projectId }}</h2>
        <p class="q-mt-sm">
          Choose one of your connected editors. Its existing project access is preserved.
        </p>
        <q-linear-progress v-if="loading" indeterminate class="q-my-md" />
        <template v-else-if="!error || connections.length">
          <p v-if="!connections.length">
            Connect ChatGPT or another editor to AMCUI first, then return here.
          </p>
          <q-list separator>
            <q-item v-for="connection in connections" :key="connection.id" class="q-px-none">
              <q-item-section>
                <q-item-label>{{ connection.clientName }}</q-item-label>
                <q-item-label caption>
                  {{ connection.scopes.includes('exam:write') ? 'Read and edit' : 'Read only' }}
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-item-label v-if="connection.projects.includes(projectId)" class="text-positive">
                  Has access
                </q-item-label>
                <q-btn
                  v-else
                  color="primary"
                  label="Add access"
                  :loading="savingId === connection.id"
                  :disable="!!savingId"
                  @click="add(connection)"
                />
              </q-item-section>
            </q-item>
          </q-list>
        </template>
        <q-banner v-if="error" class="bg-red-1 text-negative q-mt-md" role="alert">
          {{ error }}
          <template #action>
            <q-btn
              flat
              label="Refresh connections"
              :disable="!!savingId || loading"
              @click="load()"
            />
          </template>
        </q-banner>
        <q-banner v-if="success" class="bg-green-1 text-positive q-mt-md" role="status">
          {{ success }}
        </q-banner>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="Manage connections" :to="{ name: 'Profile' }" :disable="!!savingId" />
        <q-btn flat label="Close" :disable="!!savingId" @click="dialogOpen = false" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
