import { createRouter, createWebHistory } from 'vue-router';
import routes from './routes';

import { useStore } from '@/stores/store';
import { useApiStore } from '@/stores/api';

const router = createRouter({
  history: createWebHistory(import.meta.env.VITE_BASE_URL),
  scrollBehavior: () => ({ left: 0, top: 0 }),
  routes
});

router.beforeEach(async (to) => {
  const store = useStore();
  if (to.name === 'Login') {
    if (store.isLoggedIn) {
      const redirect = String(to.query.redirect || '');
      return redirect.startsWith('/mcp/authorize?') ? redirect : { name: 'Home' };
    }
    return;
  }
  // check auth
  if (to.matched.some((record) => record.meta.requiresAuth) && !store.isLoggedIn) {
    return { name: 'Login', query: { redirect: to.fullPath } };
  }
  // if is a project url, check/load project
  const API = useApiStore();
  if (to.params.project) {
    if (to.name === 'ArchivedProject') { API.unloadProject(); API.project = ''; return; }
    const response = await API.$http.get(`${API.URL}/project/${encodeURIComponent(String(to.params.project))}/options`);
    if ((response.data as any).status?.archived) return {name: 'ArchivedProject', params: {project: to.params.project}};
    API.loadProject(to.params.project as string);
    API.setAwarenessLocation([String(to.name)]);
  } else {
    API.unloadProject();
  }
});

export default router;
