<template>
  <q-page padding class="history">
    <div class="row"><h2 class="text-h4">History</h2> <q-checkbox v-model="showDiff" label="show Diff" /></div>
    <q-timeline>
      <q-timeline-entry v-for="(c, index) in logs" :key="index" class="q-pa-none">
        <q-skeleton v-if="isLoading" type="text" width="300px" />
        <template v-else>
          <strong>{{ c.msg }}</strong> by {{ c.username }} @
          {{ formatDate(c.date) }}
          <q-btn v-if="c.type === 'commit'" flat color="negative" @click="openConfirm(c)"
            >Restore</q-btn
          >
          <div v-if="showDiff">
            <pre v-for="(l, i) in c.diff.split('\n')" :key="i">{{ l }}</pre>
          </div>
        </template>
      </q-timeline-entry>
    </q-timeline>
  </q-page>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import type { GitLog } from '../components/models';
import formatDate from '../utils/formatDate';
import { useApiStore } from '@/stores/api';

export default defineComponent({
  name: 'History',
  setup() {
    const API = useApiStore();
    const $q = useQuasar();

    const logsStart = [] as GitLog[];
    const showDiff = ref(false);

    logsStart.length = 20;
    logsStart.fill({
      sha: '',
      msg: '',
      username: '',
      date: '',
      type: 'loading',
      diff: ''
    });

    const logs = ref<GitLog[]>(logsStart);

    const isLoading = ref(true);

    onMounted(async () => {
      const response = await API.loadHistory();
      logs.value = response.data;
      isLoading.value = false;
    });

    return {
      logs,
      isLoading,
      showDiff,
      formatDate,
      openConfirm(commit: GitLog) {
        $q.dialog({
          title: 'Confirm restoring an older version!',
          message: `Warning: Everything will be replaced! With version from ${formatDate(
            commit.date
          )}`,
          persistent: true,
          ok: {
            label: 'Replace',
            color: 'negative',
            flat: true
          },
          cancel: 'Cancel'
        }).onOk(() => {
          API.revertGit(commit.sha);
        });
      }
    };
  }
});
</script>
<style>
.history .q-timeline__content {
  padding-bottom: 0;
}
</style>
<style scoped>
pre {
  padding: none;
  white-space: wrap;
  max-height: 50px;
  overflow: auto;
}
</style>
