<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useApiStore } from '@/stores/api';
const api = useApiStore();
const available = ref(false),
  error = ref('');
const grants = ref<{ id: string; clientName: string; projects: string[] }[]>([]);
async function load() {
  try {
    grants.value = (await api.$http.get(`${api.URL}/profile/mcp/grants`)).data;
    available.value = true;
  } catch {
    /* MCP is optional on the server. */
  }
}
async function revoke(id: string) {
  try {
    await api.$http.delete(`${api.URL}/profile/mcp/grants/${id}`);
    await load();
  } catch {
    error.value = 'Unable to revoke this connection.';
  }
}
onMounted(load);
</script>
<template>
  <div v-if="available" class="row q-py-lg">
    <q-card flat bordered class="col-12 col-md-8 offset-md-2">
      <q-card-section>
        <div class="text-h5">Connected exam editors</div>
        <p v-if="!grants.length" class="q-mt-md">No connected editors.</p>
        <q-list
          ><q-item v-for="grant in grants" :key="grant.id">
            <q-item-section
              ><q-item-label>{{ grant.clientName }}</q-item-label
              ><q-item-label caption>{{ grant.projects.join(', ') }}</q-item-label></q-item-section
            >
            <q-item-section side
              ><q-btn flat color="negative" label="Revoke" @click="revoke(grant.id)"
            /></q-item-section> </q-item
        ></q-list>
        <p v-if="error" class="text-negative">{{ error }}</p>
      </q-card-section>
    </q-card>
  </div>
</template>
