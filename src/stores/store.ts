import { ref, computed } from 'vue';
import * as Sentry from '@sentry/vue';
import { defineStore } from 'pinia';
import type { Project, User } from '../components/models';
import { useRouter } from 'vue-router';

export const useStore = defineStore('store', () => {
  const router = useRouter();

  const token = ref<string | undefined>(undefined);
  const user = ref<User>();
  const projects = ref<Project[]>([]);
  const projectsRecent = ref<Project[]>([]);
  const drawerLeftVisible = ref(true);
  const activeEditor = ref<string>('');
  const tableActionMenuOpen = ref(false);

  const isLoggedIn = computed(() => {
    return (
      !!token.value &&
      !!user.value?.exp &&
      Math.round(new Date().getTime() / 1000) <= user.value.exp
    );
  });

  function saveAuthToken(token: string) {
    localStorage.setItem('jwtToken', token);
  }

  function deleteAuthToken() {
    localStorage.removeItem('jwtToken');
  }

  function setToken(newToken: string) {
    const base64Url = newToken.split('.')[1];
    const base64 = base64Url.replace('-', '+').replace('_', '/');
    saveAuthToken(newToken);
    token.value = newToken;
    user.value = JSON.parse(window.atob(base64));
  }

  function loadAuthToken() {
    const savedToken = localStorage.getItem('jwtToken');
    if (savedToken) {
      setToken(savedToken);
    }
  }
  loadAuthToken();

  return {
    activeEditor,
    tableActionMenuOpen,
    token,
    user,
    projects,
    projectsRecent,
    drawerLeftVisible,
    isLoggedIn,
    setToken,
    logout() {
      deleteAuthToken();
      token.value = undefined;
      user.value = {} as User;
      projects.value = [];
      projectsRecent.value = [];
      Sentry.getCurrentScope().setUser(null);

      if (router.currentRoute.value.path !== '/login') {
        router.push('/login');
      }
    },
    setProjects(data: Project[]) {
      projects.value = data;
    },
    setProjectsRecent(data: Project[]) {
      projectsRecent.value = data;
    },
    setDrawerLeft(isVisible: boolean) {
      drawerLeftVisible.value = isVisible;
    }
  };
});
