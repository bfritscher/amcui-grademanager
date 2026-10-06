<template>
  <q-page padding>
    <div class="row items-center q-gutter-sm q-mb-md">
      <div class="text-h5">Administration</div>
      <q-space />
      <q-btn flat icon="sym_o_refresh" label="Refresh tables" @click="load" />
      <q-btn outline label="Refresh disk inventory" @click="action('/admin/inventory', {})" />
    </div>
    <q-banner v-if="error" class="bg-red-1 text-negative q-mb-md">{{ error }}</q-banner>
    <div class="text-caption q-mb-md">
      Inventory: {{ date(metrics.inventoryAt) }} · Pending approvals:
      {{ metrics.pendingApprovals || 0 }} · Email queue: {{ metrics.mail?.pending || 0 }} · Delivery
      failures: {{ metrics.mail?.failures?.length || 0 }}
      <span v-if="metrics.mail && !metrics.mail.configured" class="text-negative">
        · Email delivery is not configured</span
      >
    </div>
    <div class="text-caption q-mb-sm">
      Requests: {{ metrics.requests || 0 }} · Errors: {{ metrics.errors || 0 }} · Throttled:
      {{ metrics.throttled || 0 }} · Average response:
      {{ Number(metrics.averageLatencyMs || 0).toFixed(1) }} ms (since server start)
    </div>
    <q-tabs v-model="tab" align="left" dense>
      <q-tab name="projects" label="Projects" />
      <q-tab name="users" label="Users" />
      <q-tab name="approvals" :label="`Approvals (${metrics.pendingApprovals || 0})`" />
      <q-tab name="jobs" label="Jobs" />
      <q-tab name="activity" label="Activity" />
    </q-tabs>
    <div class="row q-gutter-md items-center q-my-md">
      <q-input
        v-if="['projects', 'users', 'approvals'].includes(tab)"
        v-model="search"
        dense
        outlined
        debounce="300"
        label="Search by name"
        clearable
      />
      <q-checkbox
        v-if="['projects', 'users'].includes(tab)"
        v-model="inactive"
        label="Inactive for 24 months"
      />
      <q-select
        v-if="tab === 'projects'"
        v-model="status"
        dense
        outlined
        label="Status"
        :options="['All', 'active', 'archived', 'archiving']"
        style="min-width: 130px"
      />
      <q-btn v-if="tab === 'users'" outline label="Merge accounts" @click="openMerge" />
      <q-btn
        v-if="tab === 'projects' && selected.length"
        color="warning"
        :label="`Archive selected (${selected.length})`"
        @click="archive(selected)"
      />
    </div>
    <q-table
      v-model:pagination="pagination"
      v-model:selected="selected"
      :rows="rows"
      :columns="columns"
      :row-key="rowKey"
      :loading="loading"
      :selection="tab === 'projects' ? 'multiple' : 'none'"
      :rows-per-page-options="[25, 50, 100]"
      dense
      wrap-cells
      @request="requestPage"
    >
      <template #body-cell-bytes="props"
        ><q-td :props="props"
          >{{ size(props.row.bytes)
          }}<q-tooltip v-if="props.row.folders">{{
            folderSummary(props.row.folders)
          }}</q-tooltip></q-td
        ></template
      >
      <template #body-cell-projects="props"
        ><q-td :props="props"
          ><span v-for="(name, index) in props.row.projects" :key="name"
            ><router-link :to="{ name: 'Edit', params: { project: name, sectionIndex: '0' } }">{{
              name
            }}</router-link
            >{{ Number(index) < props.row.projects.length - 1 ? ', ' : '' }}</span
          ></q-td
        ></template
      >
      <template #body-cell-actions="props">
        <q-td :props="props">
          <q-btn-dropdown v-if="tab === 'projects'" dense flat label="Actions">
            <q-list>
              <q-item
                v-if="!props.row.users.length"
                v-close-popup
                clickable
                @click="action('/admin/import', { project: props.row.name })"
                ><q-item-section>Import folder and join project</q-item-section></q-item
              >
              <q-item
                v-close-popup
                clickable
                @click="
                  action(
                    props.row.users.includes(store.user?.username)
                      ? '/admin/removefromproject'
                      : '/admin/addtoproject',
                    { project: props.row.name }
                  )
                "
                ><q-item-section>{{
                  props.row.users.includes(store.user?.username) ? 'Remove myself' : 'Add myself'
                }}</q-item-section></q-item
              >
              <q-item
                v-if="props.row.status === 'active'"
                v-close-popup
                clickable
                @click="action(`/admin/project/${encodeURIComponent(props.row.name)}/gitgc`, {})"
                ><q-item-section>Git GC</q-item-section></q-item
              >
              <q-item
                v-if="props.row.status === 'active'"
                v-close-popup
                clickable
                @click="archive([props.row])"
                ><q-item-section>Archive and reclaim space</q-item-section></q-item
              >
              <q-item v-close-popup clickable @click="refreshProject(props.row)"
                ><q-item-section>Refresh measurement</q-item-section></q-item
              >
              <q-item v-close-popup clickable @click="deleteProject(props.row)"
                ><q-item-section class="text-negative">Delete project</q-item-section></q-item
              >
            </q-list>
          </q-btn-dropdown>
          <template v-else-if="tab === 'approvals'">
            <q-btn flat color="positive" label="Approve" @click="state(props.row, 'active')" />
            <q-btn flat color="negative" label="Reject" @click="state(props.row, 'rejected')" />
          </template>
          <q-btn-dropdown v-else-if="tab === 'users'" dense flat label="Actions">
            <q-list>
              <q-item
                v-if="props.row.status === 'active'"
                v-close-popup
                clickable
                @click="state(props.row, 'disabled')"
                ><q-item-section>Disable account</q-item-section></q-item
              >
              <q-item
                v-if="props.row.status === 'disabled'"
                v-close-popup
                clickable
                @click="state(props.row, 'active')"
                ><q-item-section>Enable account</q-item-section></q-item
              >
              <q-item v-close-popup clickable @click="resetMfa(props.row)"
                ><q-item-section>Remove MFA and revoke sessions</q-item-section></q-item
              >
              <q-item v-close-popup clickable @click="resetPassword(props.row)"
                ><q-item-section>Reset password and revoke sessions</q-item-section></q-item
              >
            </q-list>
          </q-btn-dropdown>
          <q-btn
            v-else-if="tab === 'jobs' && props.row.state === 'failed'"
            flat
            label="Retry"
            @click="action(`/admin/jobs/${props.row.id}/retry`, {})"
          />
        </q-td>
      </template>
      <template #body-cell-error="props"
        ><q-td :props="props" class="text-negative">{{ props.row.error }}</q-td></template
      >
    </q-table>
    <q-dialog v-model="mergeDialog">
      <q-card style="width: 600px; max-width: 95vw">
        <q-card-section class="text-h6">Merge accounts</q-card-section>
        <q-card-section class="q-gutter-md">
          <q-select
            v-model="mergeSource"
            :options="mergeOptions"
            label="Retire this login"
            outlined
          />
          <q-select
            v-model="mergeTarget"
            :options="mergeOptions.filter((name) => name !== mergeSource)"
            label="Keep this login"
            outlined
          />
          <p>
            Project memberships transfer to the surviving account. Its password and MFA stay in
            place. Both accounts must log in again; existing MCP grants are revoked.
          </p>
        </q-card-section>
        <q-card-actions align="right"
          ><q-btn v-close-popup flat label="Cancel" /><q-btn
            color="primary"
            label="Preview merge"
            :disable="!mergeSource || !mergeTarget"
            @click="merge"
        /></q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useQuasar, type QTableColumn, type QTableProps } from 'quasar';
import { useApiStore } from '@/stores/api';
import { useStore } from '@/stores/store';

type Row = Record<string, any>;
const API = useApiStore();
const store = useStore();
const $q = useQuasar();
const tab = ref('projects');
const search = ref('');
const status = ref('All');
const inactive = ref(false);
const rows = ref<Row[]>([]);
const selected = ref<Row[]>([]);
const metrics = ref<Row>({});
const loading = ref(false);
const error = ref('');
const pagination = ref({
  page: 1,
  rowsPerPage: 50,
  rowsNumber: 0,
  sortBy: 'name',
  descending: false
});
const date = (value: unknown) => (value ? new Date(Number(value)).toLocaleString() : 'Unknown');
const size = (value: number | null) =>
  value == null ? 'Unknown' : `${(value / 1024 / 1024).toFixed(1)} MB`;
const folderSummary = (folders: Record<string, number>) =>
  Object.entries(folders)
    .map(([name, bytes]) => `${name}: ${size(bytes)}`)
    .join(' · ');
const rowKey = computed(() =>
  tab.value === 'projects' ? 'name' : ['users', 'approvals'].includes(tab.value) ? 'username' : 'id'
);
const column = (name: string, label: string, format?: (value: any) => string): QTableColumn => ({
  name,
  label,
  field: name,
  align: 'left',
  sortable: true,
  format
});
const columns = computed<QTableColumn[]>(() => {
  if (tab.value === 'projects')
    return [
      column('name', 'Name'),
      column('status', 'Status'),
      column('bytes', 'Size'),
      column('commits', 'Commits'),
      column('students', 'Students'),
      column('users', 'Members', (value) => value?.join(', ')),
      column('lastHumanActivityAt', 'Last activity', date),
      column('measuredAt', 'Measured', date),
      column('error', 'Problem'),
      column('actions', 'Actions')
    ];
  if (['users', 'approvals'].includes(tab.value))
    return [
      column('username', 'Username'),
      column('displayName', 'Name'),
      column('email', 'Email'),
      column('status', 'Status'),
      column('projects', 'Projects'),
      column('createdAt', 'Requested', date),
      column('lastLoginAt', 'Last login', date),
      column('lastHumanActivityAt', 'Human activity', date),
      column('lastMcpActivityAt', 'MCP activity', date),
      column('actions', 'Actions')
    ];
  if (tab.value === 'jobs')
    return [
      column('kind', 'Job'),
      column('target', 'Target'),
      column('state', 'Status'),
      column('progress', 'Progress'),
      column('error', 'Problem'),
      column('result', 'Result', (value) => (value ? JSON.stringify(value) : '')),
      column('updatedAt', 'Updated', date),
      column('actions', 'Actions')
    ];
  return [
    column('at', 'Time', date),
    column('actor', 'Actor'),
    column('action', 'Action'),
    column('target', 'Target'),
    column('result', 'Result')
  ];
});
let generation = 0;
async function load() {
  const current = ++generation;
  loading.value = true;
  error.value = '';
  try {
    const params = new URLSearchParams({
      search: search.value || '',
      limit: String(pagination.value.rowsPerPage),
      offset: String((pagination.value.page - 1) * pagination.value.rowsPerPage),
      sort: pagination.value.sortBy || 'name',
      desc: String(pagination.value.descending),
      inactive: String(inactive.value)
    });
    if (tab.value === 'approvals') params.set('status', 'pending');
    else if (tab.value === 'projects' && status.value !== 'All') params.set('status', status.value);
    const endpoint = tab.value === 'approvals' ? 'users' : tab.value;
    const [response, info] = await Promise.all([
      API.$http.get(`${API.URL}/admin/${endpoint}?${params}`),
      API.$http.get(`${API.URL}/admin/metrics`)
    ]);
    if (current !== generation) return;
    const data = response.data as any;
    if (Array.isArray(data)) {
      const field = pagination.value.sortBy;
      data.sort((a: Row, b: Row) =>
        typeof a[field] === 'number' && typeof b[field] === 'number'
          ? a[field] - b[field]
          : String(a[field] ?? '').localeCompare(String(b[field] ?? ''))
      );
      if (pagination.value.descending) data.reverse();
      const offset = (pagination.value.page - 1) * pagination.value.rowsPerPage;
      rows.value = data.slice(offset, offset + pagination.value.rowsPerPage);
    } else rows.value = data.items;
    pagination.value.rowsNumber = Array.isArray(data) ? data.length : data.total;
    metrics.value = info.data as Row;
  } catch (e: any) {
    if (current === generation)
      error.value =
        e.response?.data?.error || e.response?.data || e.message || 'Unable to load administration';
  } finally {
    if (current === generation) loading.value = false;
  }
}
const requestPage: NonNullable<QTableProps['onRequest']> = ({ pagination: page }) => {
  Object.assign(pagination.value, page);
  void load();
};
watch([tab, search, status, inactive], () => {
  pagination.value.page = 1;
  pagination.value.sortBy =
    tab.value === 'projects'
      ? 'name'
      : tab.value === 'jobs'
        ? 'updatedAt'
        : tab.value === 'activity'
          ? 'at'
          : 'username';
  pagination.value.descending = ['jobs', 'activity'].includes(tab.value);
  selected.value = [];
  void load();
});
const confirm = (title: string, message: string) =>
  new Promise<boolean>((resolve) =>
    $q
      .dialog({ title, message, cancel: true, persistent: true })
      .onOk(() => resolve(true))
      .onCancel(() => resolve(false))
  );
async function action(endpoint: string, body: unknown) {
  try {
    await API.$http.post(API.URL + endpoint, body);
    await load();
    $q.notify({ type: 'positive', message: 'Request completed or queued' });
  } catch (e: any) {
    error.value = e.response?.data?.error || e.response?.data || e.message || 'Operation failed';
  }
}
async function state(row: Row, value: string) {
  if (
    await confirm(
      `${value === 'active' ? 'Enable' : value === 'rejected' ? 'Reject' : 'Disable'} ${row.username}?`,
      'Account changes are audited. Disabling revokes current access.'
    )
  )
    await action(`/admin/user/${encodeURIComponent(row.username)}/state`, { status: value });
}
async function archive(items: Row[]) {
  const active = items.filter((row) => row.status === 'active');
  if (!active.length) return;
  try {
    const previews = await Promise.all(
      active.map((row) =>
        API.$http.post(
          `${API.URL}/admin/project/${encodeURIComponent(row.name)}/archive/preview`,
          {}
        )
      )
    );
    const bytes = previews.reduce(
      (sum, response) => sum + Number((response.data as Row).bytes || 0),
      0
    );
    if (
      !(await confirm(
        `Archive ${active.map((row) => row.name).join(', ')}?`,
        `Current size: ${size(bytes)}. Keep final PDFs, static grades and reusable questions. Permanently remove source scans, grading databases, intermediate files and Git history after verification. These projects cannot return to grading mode.`
      ))
    )
      return;
    for (const row of active)
      await API.$http.post(`${API.URL}/admin/project/${encodeURIComponent(row.name)}/archive`, {});
    selected.value = [];
    tab.value = 'jobs';
    await load();
  } catch (e: any) {
    error.value = e.response?.data?.error || e.response?.data || e.message;
  }
}
const refreshProject = (row: Row) => action('/admin/inventory', { project: row.name });
async function deleteProject(row: Row) {
  if (
    await confirm(`Delete ${row.name}?`, 'Permanently delete this project and all its documents.')
  )
    await action(`/admin/project/${encodeURIComponent(row.name)}/delete`, {});
}
async function resetMfa(row: Row) {
  if (
    await confirm(
      `Remove MFA for ${row.username}?`,
      'Current sessions and MCP grants will be revoked.'
    )
  )
    await action(`/admin/user/${encodeURIComponent(row.username)}/removemfa`, {});
}
function resetPassword(row: Row) {
  $q.dialog({
    title: `Reset password for ${row.username}`,
    message: 'At least 12 characters. Current sessions will be revoked.',
    prompt: { model: '', type: 'password' },
    cancel: true
  }).onOk((password) => {
    void action(`/admin/user/${encodeURIComponent(row.username)}/changepassword`, {
      newPassword: password
    });
  });
}
const mergeDialog = ref(false);
const mergeSource = ref('');
const mergeTarget = ref('');
const mergeOptions = ref<string[]>([]);
async function openMerge() {
  try {
    const names: string[] = [];
    let total = Infinity;
    while (names.length < total) {
      const response = await API.$http.get(
        `${API.URL}/admin/users?status=active&limit=100&offset=${names.length}`
      );
      const data = response.data as any;
      names.push(...data.items.map((row: Row) => row.username));
      total = data.total;
      if (!data.items.length) break;
    }
    mergeOptions.value = names;
    mergeDialog.value = true;
  } catch (e: any) {
    error.value = e.message;
  }
}
async function merge() {
  try {
    const body = { source: mergeSource.value, target: mergeTarget.value };
    const response = await API.$http.post(`${API.URL}/admin/merge/preview`, body);
    const preview = response.data as Row;
    if (
      await confirm(
        `Merge ${body.source} into ${body.target}?`,
        `Projects: ${preview.projects.join(', ') || 'none'}. ${preview.sourceAdministrator ? 'The retired account’s administrator role will be removed. ' : ''}The old login is retired; historical attribution stays intact.`
      )
    ) {
      mergeDialog.value = false;
      await action('/admin/merge', body);
      tab.value = 'jobs';
    }
  } catch (e: any) {
    error.value = e.response?.data?.error || e.response?.data || e.message;
  }
}
let poll: ReturnType<typeof setInterval>;
onMounted(() => {
  void load();
  poll = setInterval(() => {
    if (tab.value === 'jobs' || tab.value === 'approvals' || metrics.value.inventoryAt == null)
      void load();
    else
      void API.$http
        .get(`${API.URL}/admin/metrics`)
        .then((response) => {
          metrics.value = response.data as Row;
        })
        .catch(() => {});
  }, 5000);
});
onUnmounted(() => {
  clearInterval(poll);
  generation++;
});
</script>
