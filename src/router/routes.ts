import { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      {
        name: 'Home',
        path: '',
        component: () => import('pages/Home.vue'),
        meta: {
          requiresAuth: true,
        },
      },
      {
        path: 'login',
        name: 'Login',
        component: () => import('pages/Login.vue'),
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('pages/Profile.vue'),
        meta: {
          requiresAuth: true,
        },
      },
      {
        path: ':project/edit',
        redirect: to => {
          return {
            name: 'Edit',
            params: {
              project: to.params.project,
              sectionIndex: '0'
            },
          };
        },
        components: {
          default: () => import('pages/Edit.vue'),
          LeftDrawer: () => import('components/Edit/EditDrawer.vue'),
        },        
        children: [
          {
            name: 'Edit',
            path: 'section/:sectionIndex?',
            component: () => import('components/Edit/ExamSection.vue'),
          },
        ],
        meta: {
          requiresAuth: true,
        },
      },
      {
        path: ':project/scan',
        name: 'Scan',
        components: {
          default: () => import('pages/Scan.vue'),
          LeftDrawer: () => import('components/Scan/ScanDrawer.vue'),
        },
        children: [
          {
            name: 'ScanPreview',
            path: ':student/:page/:copy/:question?',
            component: () => import('components/Scan/ScanPreview.vue'),
          },
        ],
        meta: {
          requiresAuth: true,
        },
      },
      {
        path: ':project/grade/:tab?',
        name: 'Grade',
        component: () => import('pages/Grade.vue'),
        meta: {
          requiresAuth: true,
        },
      },
      {
        path: ':project/history',
        name: 'History',
        component: () => import('pages/History.vue'),
        meta: {
          requiresAuth: true,
        },
      },
      {
        path: ':project/options',
        name: 'Options',
        component: () => import('pages/Options.vue'),
        meta: {
          requiresAuth: true,
        },
      },
      {
        path: 'admin',
        name: 'Admin',
        component: () => import('pages/Admin.vue'),
        meta: {
          requiresAuth: true,
        },
      },      
    ],
  },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/Error404.vue'),
  },
];

export default routes;
