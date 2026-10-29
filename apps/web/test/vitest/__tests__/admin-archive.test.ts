import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { Notify, Quasar, QForm, QInput, QTabs, QTable } from 'quasar';
import ArchivedProject from '@/pages/ArchivedProject.vue';
import Admin from '@/pages/Admin.vue';

const state = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), route: undefined as any }));
vi.mock('@/stores/api', () => ({
  useApiStore: () => ({ URL: '/api', $http: { get: state.get, post: state.post } })
}));
vi.mock('@/stores/store', () => ({
  useStore: () => ({ token: 'test-token', user: { username: 'admin' }, projects: [] })
}));
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue');
  state.route = reactive({ params: { project: 'exam-one' } });
  return { useRoute: () => state.route, useRouter: () => ({ push: vi.fn() }) };
});
const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.useRealTimers();
});
const render = (component: any) => {
  const wrapper = mount(component, {
    global: {
      plugins: [[Quasar, { plugins: { Notify } }]],
      stubs: {
        QPage: { template: '<main><slot /></main>' },
        QDialog: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /></div>' },
        RouterLink: { template: '<a><slot /></a>' }
      }
    }
  });
  mounted.push(wrapper);
  return wrapper;
};
const archive = (name = 'First exam') => ({
  manifest: { archivedAt: 123, files: [{ id: 'papers', label: 'Final papers', bytes: 1024 }] },
  exam: {
    graphics: {},
    codes: {},
    sections: [
      {
        id: 's',
        title: name,
        content: '',
        questions: [
          {
            id: 'q',
            number: 1,
            content: '<p>Reusable question<img onerror="alert(1)"><script>alert(1)</script></p>',
            answers: [],
            answer: ''
          }
        ]
      }
    ]
  },
  results: {
    columns: ['id', 'FinalGrade'],
    questions: [{ id: 1, title: 'Q1', max: 10 }],
    rows: [
      { _key: 'student:00123', id: '00123', FinalGrade: 5.5, _copy: '1:0', questions: { Q1: 9 } }
    ]
  }
});
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  state.get.mockReset();
  state.post.mockReset();
  state.route.params.project = 'exam-one';
});

describe('archived exam viewer', () => {
  it('renders sanitized questions and saved grades without requesting live AMC endpoints', async () => {
    state.get.mockResolvedValue({ data: archive() });
    const wrapper = render(ArchivedProject);
    await flushPromises();
    expect(wrapper.text()).toContain('Reusable question');
    expect(wrapper.findAll('script, [onerror]')).toHaveLength(0);
    wrapper.findComponent(QTabs).vm.$emit('update:modelValue', 'grades');
    await flushPromises();
    expect(wrapper.text()).toContain('00123');
    expect(wrapper.text()).toContain('5.5');
    expect(wrapper.text()).toContain('9');
    expect(state.get.mock.calls.map(([url]) => url)).toEqual(['/api/project/exam-one/archive']);
    expect(state.post).not.toHaveBeenCalled();
    expect(wrapper.find('a[href*="grades-csv"]').attributes('href')).toContain('test-token');
  });
  it('reloads snapshots when navigating between archives in the same view', async () => {
    state.get
      .mockResolvedValueOnce({ data: archive() })
      .mockResolvedValueOnce({ data: archive('Second exam') });
    const wrapper = render(ArchivedProject);
    await flushPromises();
    state.route.params.project = 'exam-two';
    await flushPromises();
    expect(wrapper.text()).toContain('Second exam');
    expect(wrapper.text()).not.toContain('First exam');
    expect(state.get).toHaveBeenLastCalledWith('/api/project/exam-two/archive');
  });
});
describe('admin tables', () => {
  it.each([
    {
      field: 'email',
      label: 'email',
      inputLabel: 'Email address',
      previous: 'old@example.org',
      input: ' New@Example.org ',
      saved: 'new@example.org'
    },
    {
      field: 'displayName',
      label: 'name',
      inputLabel: 'Name',
      previous: 'Old name',
      input: ' Élodie Müller ',
      saved: 'Élodie Müller'
    }
  ] as const)(
    'edits a user $label and refreshes the table after saving',
    async ({ field, label, inputLabel, previous, input, saved }) => {
      const user = {
        username: 'alice+test',
        status: 'active',
        projects: [],
        [field]: previous
      };
      state.get.mockImplementation(async (url: string) => ({
        data: url.includes('/metrics') ? { inventoryAt: 123 } : { items: [user], total: 1 }
      }));
      state.post.mockImplementation(async (_url: string, body: Record<string, string>) => {
        user[field] = body[field];
        return { data: { username: user.username, [field]: user[field] } };
      });
      const wrapper = render(Admin);
      await flushPromises();
      wrapper.findComponent(QTabs).vm.$emit('update:modelValue', 'users');
      await flushPromises();
      await wrapper.find(`[aria-label="Edit ${label} for alice+test"]`).trigger('click');
      const editor = wrapper
        .findAllComponents(QInput)
        .find((input) => input.props('label') === inputLabel)!;
      expect(editor.props('modelValue')).toBe(previous);
      await editor.find('input').setValue(input);
      await wrapper.findComponent(QForm).trigger('submit');
      await flushPromises();
      expect(state.post).toHaveBeenCalledExactlyOnceWith(`/api/admin/user/alice%2Btest/${label}`, {
        [field]: saved
      });
      expect(wrapper.text()).toContain(saved);
      expect(wrapper.text()).not.toContain(`Edit ${label} for alice+test`);
    }
  );
  it.each([
    {
      field: 'email',
      label: 'email',
      inputLabel: 'Email address',
      value: 'taken@example.org',
      error: 'Email address is already associated with another account'
    },
    {
      field: 'displayName',
      label: 'name',
      inputLabel: 'Name',
      value: 'Élodie Müller',
      error: 'Operation already running'
    }
  ])(
    'keeps rejected $label edits and allows cancellation without changing the account',
    async ({ field, label, inputLabel, value, error }) => {
      const user = { username: 'legacy', status: 'unverified', projects: [] };
      state.get.mockImplementation(async (url: string) => ({
        data: url.includes('/metrics') ? { inventoryAt: 123 } : { items: [user], total: 1 }
      }));
      state.post.mockRejectedValue({
        response: { data: { error } }
      });
      const wrapper = render(Admin);
      await flushPromises();
      wrapper.findComponent(QTabs).vm.$emit('update:modelValue', 'users');
      await flushPromises();
      await wrapper.find(`[aria-label="Edit ${label} for legacy"]`).trigger('click');
      expect(wrapper.text().includes('resend verification')).toBe(field === 'email');
      const editor = wrapper
        .findAllComponents(QInput)
        .find((input) => input.props('label') === inputLabel)!;
      await editor.find('input').setValue(value);
      await wrapper.findComponent(QForm).trigger('submit');
      await flushPromises();
      expect(wrapper.find('[role="alert"]').text()).toContain(error);
      expect(editor.props('modelValue')).toBe(value);
      await wrapper
        .findAll('button')
        .find((button) => button.text() === 'Cancel')!
        .trigger('click');
      expect(wrapper.text()).not.toContain(`Edit ${label} for legacy`);
      expect(state.post).toHaveBeenCalledTimes(1);
      expect(user).not.toHaveProperty(field);
    }
  );
  it('loads paginated projects and pending counts without requesting disk scans', async () => {
    state.get.mockImplementation(async (url: string) => ({
      data: url.includes('/metrics')
        ? {
            inventoryAt: 123,
            pendingApprovals: 2,
            mail: { configured: true, pending: 0, failures: [] }
          }
        : {
            items: [{ name: 'exam', status: 'active', bytes: 1048576, users: ['admin'] }],
            total: 683
          }
    }));
    const wrapper = render(Admin);
    await flushPromises();
    expect(wrapper.text()).toContain('Approvals (2)');
    expect(wrapper.text()).toContain('exam');
    expect(wrapper.text()).toContain('1.0 MB');
    expect(wrapper.findComponent(QTable).props('pagination')).toMatchObject({
      rowsNumber: 683,
      rowsPerPage: 50
    });
    expect(state.post).not.toHaveBeenCalled();
    wrapper.findComponent(QTable).vm.$emit('request', {
      pagination: { page: 2, rowsPerPage: 50, sortBy: 'name', descending: false }
    });
    await flushPromises();
    expect(state.get.mock.calls.some(([url]) => url.includes('offset=50'))).toBe(true);
  });
  it('shows pending requests with approval controls', async () => {
    state.get.mockImplementation(async (url: string) => ({
      data: url.includes('/metrics')
        ? { pendingApprovals: 1 }
        : url.includes('/users')
          ? {
              items: [
                { username: 'alice', status: 'pending', projects: [], email: 'alice@example.org' }
              ],
              total: 1
            }
          : { items: [], total: 0 }
    }));
    const wrapper = render(Admin);
    await flushPromises();
    wrapper.findComponent(QTabs).vm.$emit('update:modelValue', 'approvals');
    await flushPromises();
    expect(wrapper.text()).toContain('alice@example.org');
    expect(wrapper.text()).toContain('Approve');
    expect(wrapper.text()).toContain('Reject');
    expect(
      state.get.mock.calls.some(
        ([url]) => url.includes('/admin/users?') && url.includes('status=pending')
      )
    ).toBe(true);
  });
});
