import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { QCheckbox, QInput, QOptionGroup, Quasar } from 'quasar';
import McpConnections from '@/components/McpConnections.vue';
import McpProjectAccess from '@/components/McpProjectAccess.vue';
import McpAuthorize from '@/pages/McpAuthorize.vue';

const http = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }));
vi.mock('@/stores/api', () => ({ useApiStore: () => ({ URL: '/api', $http: http }) }));
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({ query: { request: 'consent-ticket' } })
}));

const grant = {
  id: 'chatgpt',
  clientName: 'ChatGPT',
  projects: ['old-exam'],
  scopes: ['exam:read', 'exam:write']
};
const wrappers: VueWrapper[] = [];
const render = (component: any, props = {}) => {
  const wrapper = mount(component, {
    props,
    global: {
      plugins: [Quasar],
      stubs: {
        QPage: { template: '<main><slot /></main>' },
        QDialog: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /></div>' }
      }
    }
  });
  wrappers.push(wrapper);
  return wrapper;
};
const button = (wrapper: VueWrapper, text: string) => {
  const match = wrapper.findAll('button').find((item) => item.text() === text);
  if (!match) throw new Error(`Missing button: ${text}`);
  return match;
};
const checkbox = (wrapper: VueWrapper, label: string) => {
  const match = wrapper.findAllComponents(QCheckbox).find((item) => item.props('label') === label);
  if (!match) throw new Error(`Missing project checkbox: ${label}`);
  return match;
};
beforeEach(() => {
  vi.resetAllMocks();
  http.get.mockImplementation(async (url: string) => ({
    data: url.endsWith('/grants') ? [grant] : { grant, availableProjects: ['old-exam', 'new-exam'] }
  }));
  http.put.mockResolvedValue({ data: { ...grant, projects: ['old-exam', 'new-exam'] } });
  http.post.mockResolvedValue({ data: { ...grant, projects: ['old-exam', 'new-exam'] } });
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.unstubAllGlobals();
});

describe('connection project picker', () => {
  it('preserves existing selection while filtering and adds a project without reconnecting', async () => {
    const wrapper = render(McpConnections);
    await flushPromises();
    await button(wrapper, 'Edit projects').trigger('click');
    await flushPromises();
    expect(wrapper.findComponent(QOptionGroup).props('modelValue')).toEqual(['old-exam']);
    expect(button(wrapper, 'Save projects').attributes('disabled')).toBeDefined();
    await wrapper.findComponent(QInput).find('input').setValue('NEW');
    expect(wrapper.findComponent(QOptionGroup).props('options')).toEqual([
      { label: 'new-exam', value: 'new-exam' }
    ]);
    await checkbox(wrapper, 'new-exam').trigger('click');
    await button(wrapper, 'Save projects').trigger('click');
    await flushPromises();
    expect(http.put).toHaveBeenCalledWith('/api/profile/mcp/grants/chatgpt/projects', {
      projects: ['old-exam', 'new-exam']
    });
    expect(wrapper.text()).toContain('old-exam, new-exam');
    expect(wrapper.text()).toContain('no reconnection is needed');
    expect(http.delete).not.toHaveBeenCalled();
  });

  it('prevents empty read-only access, cancels without saving and retains selections after a failed save', async () => {
    const readOnly = { ...grant, scopes: ['exam:read'] };
    http.get.mockImplementation(async (url: string) => ({
      data: url.endsWith('/grants')
        ? [readOnly]
        : { grant: readOnly, availableProjects: ['old-exam', 'new-exam'] }
    }));
    const wrapper = render(McpConnections);
    await flushPromises();
    await button(wrapper, 'Edit projects').trigger('click');
    await flushPromises();
    await checkbox(wrapper, 'old-exam').trigger('click');
    expect(button(wrapper, 'Save projects').attributes('disabled')).toBeDefined();
    await button(wrapper, 'Cancel').trigger('click');
    expect(http.put).not.toHaveBeenCalled();
    await button(wrapper, 'Edit projects').trigger('click');
    await flushPromises();
    await checkbox(wrapper, 'new-exam').trigger('click');
    http.put.mockRejectedValueOnce({
      isAxiosError: true,
      response: { data: { error: 'Connection expired. Reconnect your editor.' } }
    });
    await button(wrapper, 'Save projects').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Connection expired. Reconnect your editor.');
    expect(wrapper.findComponent(QOptionGroup).props('modelValue')).toEqual([
      'old-exam',
      'new-exam'
    ]);
    expect(button(wrapper, 'Save projects').attributes('disabled')).toBeUndefined();
  });

  it('saves an empty editing selection while explaining that project creation remains enabled', async () => {
    http.put.mockResolvedValueOnce({ data: { ...grant, projects: [] } });
    const wrapper = render(McpConnections);
    await flushPromises();
    await button(wrapper, 'Edit projects').trigger('click');
    await flushPromises();
    await checkbox(wrapper, 'old-exam').trigger('click');
    expect(button(wrapper, 'Save projects').attributes('disabled')).toBeUndefined();
    expect(wrapper.text()).toContain('An empty selection still allows this editor to create');
    await button(wrapper, 'Save projects').trigger('click');
    await flushPromises();
    expect(http.put).toHaveBeenCalledWith('/api/profile/mcp/grants/chatgpt/projects', {
      projects: []
    });
    expect(wrapper.text()).toContain('No projects selected');
    expect(http.delete).not.toHaveBeenCalled();
  });

  it('explains projects that have become inaccessible and only submits accessible selections', async () => {
    http.get.mockImplementation(async (url: string) => ({
      data: url.endsWith('/grants') ? [grant] : { grant, availableProjects: ['new-exam'] }
    }));
    const wrapper = render(McpConnections);
    await flushPromises();
    await button(wrapper, 'Edit projects').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('previously selected project(s) are no longer available');
    await checkbox(wrapper, 'new-exam').trigger('click');
    await button(wrapper, 'Save projects').trigger('click');
    await flushPromises();
    expect(http.put).toHaveBeenCalledWith('/api/profile/mcp/grants/chatgpt/projects', {
      projects: ['new-exam']
    });
  });
});

describe('connecting before project creation', () => {
  it('connects an editor with no projects selected and discloses creation access', async () => {
    http.get.mockResolvedValueOnce({
      data: { clientName: 'ChatGPT', projects: [], scopes: ['exam:read', 'exam:write'] }
    });
    http.post.mockResolvedValueOnce({ data: { redirect: 'https://chatgpt.com/callback' } });
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });
    const wrapper = render(McpAuthorize);
    await flushPromises();
    expect(button(wrapper, 'Connect').attributes('disabled')).toBeUndefined();
    expect(wrapper.text()).toContain('automatically access the projects it creates');
    expect(wrapper.text()).toContain('create your first project from chat');
    await button(wrapper, 'Connect').trigger('click');
    await flushPromises();
    expect(http.post).toHaveBeenCalledWith('/api/profile/mcp/authorize/consent-ticket', {
      allow: true,
      projects: []
    });
    expect(assign).toHaveBeenCalledWith('https://chatgpt.com/callback');
  });

  it('requires a project for read-only consent and lets the user cancel with no selection', async () => {
    http.get.mockResolvedValueOnce({
      data: { clientName: 'Reader', projects: ['old-exam'], scopes: ['exam:read'] }
    });
    http.post.mockResolvedValueOnce({
      data: { redirect: 'https://chatgpt.com/callback?error=access_denied' }
    });
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });
    const wrapper = render(McpAuthorize);
    await flushPromises();
    expect(button(wrapper, 'Connect').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).not.toContain('create your first project');
    await checkbox(wrapper, 'old-exam').trigger('click');
    expect(button(wrapper, 'Connect').attributes('disabled')).toBeUndefined();
    await checkbox(wrapper, 'old-exam').trigger('click');
    await button(wrapper, 'Cancel').trigger('click');
    await flushPromises();
    expect(http.post).toHaveBeenCalledWith('/api/profile/mcp/authorize/consent-ticket', {
      allow: false,
      projects: []
    });
  });
});

describe('project Options shortcut', () => {
  it('adds only the current project to the chosen connection and shows access without reauthorization', async () => {
    const wrapper = render(McpProjectAccess, { projectId: 'new-exam' });
    await flushPromises();
    await button(wrapper, 'Add editor access').trigger('click');
    await flushPromises();
    await button(wrapper, 'Add access').trigger('click');
    await flushPromises();
    expect(http.post).toHaveBeenCalledWith('/api/profile/mcp/grants/chatgpt/projects', {
      projectId: 'new-exam'
    });
    expect(http.put).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Has access');
    expect(wrapper.text()).toContain('Access to new-exam added for ChatGPT');
    expect(wrapper.findAll('button').some((item) => item.text() === 'Add access')).toBe(false);
  });

  it('shows existing access and offers connection management when there are no connected editors', async () => {
    const wrapper = render(McpProjectAccess, { projectId: 'old-exam' });
    await flushPromises();
    await button(wrapper, 'Add editor access').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Has access');
    expect(http.post).not.toHaveBeenCalled();
    http.get.mockResolvedValue({ data: [] });
    await button(wrapper, 'Close').trigger('click');
    await button(wrapper, 'Add editor access').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Connect ChatGPT or another editor to AMCUI first');
    expect(wrapper.text()).toContain('Manage connections');
  });

  it('keeps failed additions actionable and closes the picker when the current project changes', async () => {
    const wrapper = render(McpProjectAccess, { projectId: 'new-exam' });
    await flushPromises();
    await button(wrapper, 'Add editor access').trigger('click');
    await flushPromises();
    http.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { data: { error: 'This project is no longer accessible.' } }
    });
    await button(wrapper, 'Add access').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('This project is no longer accessible.');
    expect(wrapper.text()).toContain('Refresh connections');
    expect(wrapper.text()).not.toContain('Has access');
    await wrapper.setProps({ projectId: 'another-exam' });
    expect(wrapper.text()).not.toContain('Give an editor access');
  });
});
