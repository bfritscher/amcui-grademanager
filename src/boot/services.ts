import { boot } from 'quasar/wrappers'
import Api from '../services/api';
import { reactive } from 'vue';
import ExamEditor from '../services/examEditor';
import GradeService from '../services/grade';

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    API: Api;
    examService: ExamEditor;
    gradeService: GradeService;
  }
}

export default boot(({ app, router, store }) => {
  const API:Api = reactive(new Api({router, store})) as any; // FIXME?
  const examService:ExamEditor = reactive(new ExamEditor({store, router, API})) as any; // FIXME?
  const gradeService = new GradeService({API});
  app.provide('API', API);
  app.provide('examService', examService);
  app.provide('gradeService', gradeService);
  app.config.globalProperties.API = API;
  app.config.globalProperties.examService = examService;
  app.config.globalProperties.gradeService = gradeService;

  router.beforeEach((to, from, next) => {
    if (to.name === 'Login') {
      if (store.getters.isLoggedIn()) {
        next({ name: 'Home' });
      } else {
        next();
      }
      return;
    }
    // check auth
    if (to.matched.some((record) => record.meta.requiresAuth)) {
      if (store.getters.isLoggedIn()) {
        next();
      } else {
        next('/login');
      }
    } else {
      next();
    }
    // if is a project url, check/load project
    if (to.params.project) {
      API.loadProject(to.params.project as string);
    }
  });

})


