<template>
  <q-page padding class="history">
    <h2 class="text-h4">History</h2>
    <q-timeline>
      <q-timeline-entry
        v-for="(c, index) in logs"
        :key="index"
        class="q-pa-none"
      >
        <q-skeleton v-if="isLoading" type="text" width="300px" />
        <template v-else>
          <strong>{{ c.msg }}</strong> by {{ c.username }} @
          {{ formatDate(c.date) }}
          <q-btn
            v-if="c.type === 'commit'"
            flat
            color="negative"
            @click="openConfirm(c)"
            >Restore</q-btn
          >
        </template>
      </q-timeline-entry>
    </q-timeline>
  </q-page>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref, inject } from 'vue';
import { useQuasar } from 'quasar';
import Api from '../services/api';
import { GitLog } from '../components/models';
import formatDate from '../utils/formatDate';

export default defineComponent({
  name: 'History',
  setup() {
    const API = inject('API') as Api;
    const $q = useQuasar();

    const logsStart = [] as GitLog[];
    logsStart.length = 20;
    logsStart.fill({
      sha: '',
      msg: '',
      username: '',
      date: '',
      type: 'loading',
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
            flat: true,
          },
          cancel: 'Cancel',
        }).onOk(() => {
          API.revertGit(commit.sha);
        });
      },
    };
  },
});
</script>
<style>
.history .q-timeline__content {
  padding-bottom: 0;
}
</style>