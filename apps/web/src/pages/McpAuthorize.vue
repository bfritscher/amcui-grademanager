<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useApiStore } from '@/stores/api';
const api = useApiStore();
const route = useRoute();
const request = String(route.query.request || '');
const connection = ref<{ clientName: string; projects: string[]; scopes: string[] } | null>(null);
const selected = ref<string[]>([]);
const busy = ref(false),
  error = ref('');
onMounted(async () => {
  try {
    connection.value = (
      await api.$http.get(`${api.URL}/profile/mcp/authorize/${encodeURIComponent(request)}`)
    ).data;
  } catch {
    error.value =
      'This connection request has expired or is unavailable. Start again from your LLM client.';
  }
});
async function decide(allow: boolean) {
  busy.value = true;
  error.value = '';
  try {
    const response = await api.$http.post(
      `${api.URL}/profile/mcp/authorize/${encodeURIComponent(request)}`,
      { allow, projects: selected.value }
    );
    window.location.assign(response.data.redirect);
  } catch {
    error.value = 'Unable to complete the connection. Please try again.';
    busy.value = false;
  }
}
</script>
<template>
  <q-page padding class="flex flex-center">
    <q-card flat bordered style="width: 600px; max-width: 100%">
      <q-card-section>
        <h1 class="text-h5">Connect an exam editor</h1>
        <template v-if="connection">
          <p>
            <strong>{{ connection.clientName }}</strong> requests access to your exams.
          </p>
          <p v-if="connection.scopes.includes('exam:write')">
            It will be able to edit questions and answers immediately. Changes will appear in open
            browser sessions.
          </p>
          <p v-else>It will be able to read the selected exams.</p>
          <p>Select the projects it may access:</p>
          <q-option-group
            v-model="selected"
            type="checkbox"
            :options="connection.projects.map((project) => ({ label: project, value: project }))"
          />
          <p v-if="!connection.projects.length">No projects are available to connect.</p>
          <p class="q-mt-md">You can revoke this connection from your profile.</p>
        </template>
        <q-banner v-if="error" class="bg-red-1 text-negative">{{ error }}</q-banner>
      </q-card-section>
      <q-card-actions v-if="connection" align="right">
        <q-btn flat label="Cancel" :disable="busy" @click="decide(false)" />
        <q-btn
          color="primary"
          label="Connect"
          :loading="busy"
          :disable="!selected.length"
          @click="decide(true)"
        />
      </q-card-actions>
    </q-card>
  </q-page>
</template>
