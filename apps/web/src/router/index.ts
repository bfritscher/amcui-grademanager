import { createRouter, createWebHistory } from 'vue-router';
import routes from './routes';

import { useStore } from '@/stores/store';
import { useApiStore } from '@/stores/api';

const router = createRouter({
  history: createWebHistory(import.meta.env.VITE_BASE_URL),
  scrollBehavior: () => ({ left: 0, top: 0 }),
  routes
});

router.beforeEach((to, from, next) => {
  const store = useStore();
  if (to.name === 'Login') {
    if (store.isLoggedIn) {
      next({ name: 'Home' });
    } else {
      next();
    }
    return;
  }
  // check auth
  if (to.matched.some((record) => record.meta.requiresAuth)) {
    if (store.isLoggedIn) {
      next();
    } else {
      next('/login');
    }
  } else {
    next();
  }
  // if is a project url, check/load project
  const API = useApiStore();
  if (to.params.project) {
    API.loadProject(to.params.project as string);
    API.setAwarenessLocation([String(to.name)]);
  } else {
    API.unloadProject();
  }
});

export default router;
