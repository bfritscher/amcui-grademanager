import * as Sentry from '@sentry/vue';
import { store } from 'quasar/wrappers';
import { InjectionKey } from 'vue';
import {
  createStore,
  Store as VuexStore,
  useStore as vuexUseStore,
} from 'vuex';
import { Project, User } from '../components/models';

// import example from './module-example'
// import { ExampleStateInterface } from './module-example/state';

/*
 * If not building with SSR mode, you can
 * directly export the Store instantiation;
 *
 * The function below can be async too; either use
 * async/await or return a Promise which resolves
 * with the Store instance.
 */

export interface StateInterface {
  // Define your own store structure, using submodules if needed
  // example: ExampleStateInterface;
  // Declared as unknown to avoid linting issue. Best to strongly type as per the line above.
  token?: string;
  user: User;
  projects: Project[];
  projectsRecent: Project[];
  drawerLeftVisible: boolean;
}

// provide typings for `this.$store`
declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $store: VuexStore<StateInterface>;
  }
}

// provide typings for `useStore` helper
export const storeKey: InjectionKey<VuexStore<StateInterface>> =
  Symbol('vuex-key');

export default store(function (/* { ssrContext } */) {
  const Store = createStore<StateInterface>({
    state: {
      token: undefined,
      user: {} as User,
      projects: [] as Project[],
      projectsRecent: [] as Project[],
      drawerLeftVisible: true,
    },
    mutations: {
      SET_TOKEN(state, token) {
        state.token = token;
      },
      SET_USER(state, user) {
        state.user = user;
      },
      SET_PROJECTS(state, projects) {
        state.projects = projects;
      },
      SET_PROJECTS_RECENT(state, projectsRecent) {
        state.projectsRecent = projectsRecent;
      },
      SET_DRAWER_LEFT(state, isVisible) {
        state.drawerLeftVisible = isVisible;
      },
    },
    actions: {
      SET_TOKEN({ commit }, token: string) {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace('-', '+').replace('_', '/');
        saveAuthToken(token);
        commit('SET_TOKEN', token);
        commit('SET_USER', JSON.parse(window.atob(base64)));
      },
      LOGOUT({ commit }) {
        deleteAuthToken();
        commit('SET_TOKEN', null);
        commit('SET_USER', {});
        Sentry.configureScope((scope) => scope.setUser(null));
        // eslint-disable-next-line
        // @ts-ignore
        if (this.$router.currentRoute.path !== '/login') {
          // eslint-disable-next-line
          // @ts-ignore
          this.$router.push('/login');
        }
      },
    },
    getters: {
      isLoggedIn(state) {
        return () => {
          return (
            !!state.token &&
            Math.round(new Date().getTime() / 1000) <= state.user.exp
          );
        };
      },
    },

    // enable strict mode (adds overhead!)
    // for dev mode and --debug builds only
    strict: !!process.env.DEBUGGING,
  });

  const KEY_LOCAL_STORAGE_TOKEN = 'jwtToken';

  function saveAuthToken(token: string) {
    localStorage.setItem(KEY_LOCAL_STORAGE_TOKEN, token);
  }

  function deleteAuthToken() {
    localStorage.removeItem(KEY_LOCAL_STORAGE_TOKEN);
  }
  function loadAuthToken() {
    const token = localStorage.getItem(KEY_LOCAL_STORAGE_TOKEN);
    if (token) {
      Store.dispatch('SET_TOKEN', token);
    }
  }
  loadAuthToken();

  return Store;
});

export function useStore() {
  return vuexUseStore(storeKey);
}
