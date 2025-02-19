import axios from 'axios';
import Papa from 'papaparse';
import io from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { Project, ExamData, Page, PageZone, Options, Graphics } from '../components/models';
import { useStore } from '@/stores/store';
import { useRouter } from 'vue-router';
import { Dialog, Notify } from 'quasar';
import ProgressDialog from '../components/ProgressDialog.vue';
import * as Sentry from '@sentry/vue';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { type Awareness } from 'y-protocols/awareness';
import { useExamStore } from './exam';

export const useApiStore = defineStore('api', () => {
  const router = useRouter();
  const store = useStore();

  const API_URL = ref((window as any).AMCUI_API);

  const PROJECT_URL = ref('');
  const project = ref('');
  const options = ref<Options>({
    users: [],
    options: {},
    status: {
      locked: '0'
    }
  });
  const connected = ref<Record<string, { username: string; colorIndex: number }>>({});
  const yjsSynced = ref(false);
  const logs = ref<any>({});
  const sortedLogs = ref<any>([]);
  const typeOfScan = ref([
    { value: '0', label: 'Different answer sheets' },
    { value: '1', label: 'Some answer sheets were photocopied' }
  ]);
  let socket: Socket | null = null;
  const isProgressDialog = ref(false);
  const $http = ref(axios.create());
  $http.value.interceptors.request.use((config) => {
    if (config && config.headers && store.token) {
      config.headers.Authorization = `Bearer ${store.token}`;
    }
    return config;
  });
  $http.value.interceptors.response.use(
    (response: any) => {
      if (response.data && response.data.token) {
        store.setToken(response.data.token);
      }
      return response;
    },
    (error) => {
      if (error?.response?.status === 401) {
        store.logout();
      }
      return Promise.reject(error);
    }
  );

  function showProgressDialog() {
    if (isProgressDialog.value) return;
    isProgressDialog.value = true;
    Dialog.create({
      component: ProgressDialog,
      persistent: true,
      noEscDismiss: true,
      noBackdropDismiss: true
    }).onDismiss(() => {
      isProgressDialog.value = false;
    });
  }

  function newLog(name: string) {
    logs.value[name] = {
      msg: name,
      log: '',
      err: '',
      progress: 0,
      start: new Date()
    };
    sortedLogs.value.unshift(logs.value[name]);
    return logs.value[name];
  }

  function getLog(name: string) {
    if (!logs.value.hasOwnProperty(name)) {
      newLog(name);
    }
    return logs.value[name];
  }

  function loadOptions() {
    $http.value.get(API_URL.value + '/project/' + project.value + '/options').then((r) => {
      const data: any = r.data;
      options.value.users = data.users || [];
      options.value.users.sort();
      options.value.options = data.options || {};
      options.value.status = Object.assign({ locked: '0' }, data.status);
      if (options.value.status.locked != '0') {
        showProgressDialog();
      }
    });
  }

  let ydoc: Y.Doc;
  let awareness: Awareness;
  let yjsProvider: WebsocketProvider;
  let allClientIds: number[];
  const awarenessIndex = ref<any>({});

  // new yjs connection
  function connectYjs(projectName: string) {
    console.time('connectYjs');
    allClientIds = []; // used for colors of connections
    let origin = '';
    let path = '/ws';
    if (API_URL.value.startsWith('http')) {
      const url = new URL(API_URL.value);
      origin = url.origin;
      if (url.pathname !== '/') {
        path = url.pathname + path;
      }
    } else {
      origin = window.location.origin;
      path = API_URL.value + path;
    }
    ydoc = new Y.Doc();
    yjsProvider = new WebsocketProvider(origin.replace('http', 'ws') + path, projectName, ydoc, {
      params: {
        access_token: store.token || ''
      }
    });
    yjsProvider.on('sync', function (isSynced: boolean) {
      yjsSynced.value = isSynced;
    });
    yjsProvider.on('connection-error', (WSErrorEvent: any) => {
      yjsProvider.disconnect();
      console.error('connection-error', WSErrorEvent);
      const log = getLog('connecting');
      log.end = new Date();
      log.progress = 1;
      log.code = 1;
      log.err = 'Socket connection error, check firewall or project permissions.';
      options.value.status.locked = '0';
      showProgressDialog();
    });

    awareness = yjsProvider.awareness;
    awareness.on('change', ({ added }: { added: any }) => {
      added.forEach((clientId: number) => {
        if (!allClientIds.includes(clientId)) {
          allClientIds.push(clientId);
        }
      });
      if (!allClientIds.includes(awareness?.clientID)) {
        allClientIds.push(awareness?.clientID);
      }
      const index: any = {};
      const all: {
        [key: string]: { username: string; colorIndex: number };
      } = {};
      awareness.getStates().forEach((value, key) => {
        value.user.colorIndex = getColorIndex(key);
        all[key] = value.user;
        if (key !== awareness?.clientID) {
          value.location?.forEach((location: string) => {
            if (!index.hasOwnProperty(location)) {
              index[location] = [];
            }
            index[location].push({
              id: key,
              ...value
            });
          });
        }
      });
      awarenessIndex.value = index;
      connected.value = all;
    });
    awareness.setLocalStateField('user', {
      username: store.user?.username
    });
    console.timeEnd('connectYjs');
  }

  function getColorIndex(id: number) {
    // fix bug where we sometimes get string
    id = parseInt(String(id), 10);
    return allClientIds.indexOf(id) % 5;
  }

  function setAwarenessLocation(locations: string[]) {
    awareness.setLocalStateField('location', locations);
  }

  function addAwarenessLocation(location: string, removeRegex?: RegExp) {
    let locations = awareness.getLocalState()?.location || [];
    if (removeRegex) {
      locations = locations.filter((l: string) => !removeRegex.test(l));
    }
    locations.push(location);
    setAwarenessLocation(locations);
  }

  function removeAwarenessLocation(location: string) {
    const locations = awareness.getLocalState()?.location || [];
    const index = locations.indexOf(location);
    if (index > -1) {
      locations.splice(index, 1);
    }
    setAwarenessLocation(locations);
  }

  function unloadProject() {
    if (yjsSynced.value) {
      setAwarenessLocation([]);
    }
    if (yjsProvider) {
      yjsProvider.disconnect();
    }
    if (ydoc) {
      ydoc.destroy();
    }
    if (socket) {
      socket.disconnect();
    }
    yjsSynced.value = false;
  }

  window.addEventListener('beforeunload', () => {
    unloadProject();
  });

  return {
    getYdoc() {
      return ydoc;
    },
    yjsSynced,
    awarenessIndex,
    setAwarenessLocation,
    addAwarenessLocation,
    removeAwarenessLocation,
    typeOfScan,
    project,
    options,
    connected,
    getColorIndex,
    PROJECT_URL,
    URL: API_URL,
    logs,
    sortedLogs,
    $http,
    getVersion() {
      return $http.value.get(API_URL.value).then((r: any) => r.data.sha);
    },
    getTemplates() {
      return $http.value.get(API_URL.value + '/templates').then((r: any) => r.data);
    },
    getProjectList() {
      return $http.value.get(API_URL.value + '/project/list').then((r: any) => {
        const list: Project[] = r.data;
        list.sort((a, b) => {
          return a.project > b.project ? 1 : -1;
        });
        const projectsIndex = {} as { [key: string]: Project };
        const projects = list.map((item: Project) => {
          item.prefix = item.project.split('-')[0];
          projectsIndex[item.project] = item;
          return item;
        });
        store.setProjects(projects);
        $http.value.get(API_URL.value + '/project/recent').then((r: any) => {
          const list: string[] = r.data;
          const projectsRecent: Project[] = [];
          list.forEach((key) => {
            if (projectsIndex.hasOwnProperty(key)) {
              projectsRecent.push(projectsIndex[key]);
            }
          });
          store.setProjectsRecent(projectsRecent);
        });
      });
    },
    createProject(project: string) {
      return $http.value.post(API_URL.value + '/project/create', { project: project });
    },
    newLog,
    getLog,
    getDownloadZipURL() {
      return API_URL.value + '/project/' + project.value + '/zip/pdf?token=' + store.token;
    },
    getAnnotateZipURL() {
      return API_URL.value + '/project/' + project.value + '/zip/annotate?token=' + store.token;
    },
    getAnnotateMergedURL() {
      return API_URL.value + '/project/' + project.value + '/merged/all?token=' + store.token;
    },
    getAnnotateMergedFirstPageURL() {
      return API_URL.value + '/project/' + project.value + '/merged/firstpage?token=' + store.token;
    },
    getStaticFileURL(file: string) {
      return (
        API_URL.value + '/project/' + project.value + '/static/' + file + '?token=' + store.token
      );
    },
    getStaticFileContent(file: string) {
      return $http.value
        .get(API_URL.value + '/project/' + project.value + '/static/' + file)
        .then((r) => r.data);
    },
    loadTemplate(name: string) {
      return $http.value
        .post(API_URL.value + '/project/' + project.value + '/copy/template', {
          template: name
        })
        .then((response: any) => response.data as string);
    },
    loadProject(projectName: string) {
      if (project.value === projectName) return;
      Sentry.setUser({ username: store.user?.username });
      Sentry.setContext('project', {
        name: projectName
      });

      unloadProject();

      project.value = projectName;
      PROJECT_URL.value = `${API_URL.value}/project/${project.value}`;
      newLog('connecting');

      let origin = '';
      let path = '/socket.io/';
      if (API_URL.value.startsWith('http')) {
        const url = new URL(API_URL.value);
        origin = url.origin;
        if (url.pathname !== '/') {
          path = url.pathname + path;
        }
      } else {
        origin = window.location.origin;
        path = API_URL.value + path;
      }
      socket = io(origin, {
        auth: { token: `Bearer ${store.token}` },
        path: path
      });

      loadOptions();
      // start new channel
      connectYjs(projectName);

      // legacy channel for logs
      socket.on('connect', () => {
        const log = getLog('connecting');
        log.end = new Date();
        log.progress = 1;
        socket?.emit('listen', project.value);
      });

      socket.on('connect_error', () => {
        const log = getLog('connecting');
        log.end = new Date();
        log.progress = 1;
        log.code = 1;
        log.err = 'Socket connection error, retrying, check firewall.';
        options.value.status.locked = '0';
        showProgressDialog();
      });

      socket.on('reconnect_failed', (error: any) => {
        Notify.create({
          type: 'negative',
          message: 'Error reconnecting socket!',
          position: 'top-right'
        });
        console.log('socket error:', error);
      });

      socket.on('update:options', (optionsUpdate: any) => {
        options.value.options = optionsUpdate;
      });

      let logLocal;

      socket.on('log', (log: any) => {
        if (log.action === 'start') {
          logLocal = newLog(log.msg as string);
          logLocal.command = log.command;
          logLocal.params = log.params;

          if (log.command === 'getimages') {
            showProgressDialog();
          }
        } else {
          // ensure a log exists if joining after start
          logLocal = getLog(log.msg as string);
        }

        if (log.action === 'log') {
          const regex = /===<.*?>=\+(.*)/g;
          const match = regex.exec(log.data as string);

          if (match) {
            logLocal.progress += parseFloat(match[1]);
          } else {
            logLocal.log += log.data + '\n';
            if (log.command === 'prepare') {
              logLocal.progress += 0.001;
            }
            if (log.command === 'prepare') {
              logLocal.progress += 0.01;
            }
          }
        }

        if (log.action === 'err') {
          logs.value[log.msg].err += log.data;
        }

        if (log.action === 'end') {
          logLocal.code = log.code;
          logLocal.progress = 1;
          logLocal.end = new Date();
          if (log.code > 0) {
            options.value.status.locked = '0';
            if (log.msg !== 'preview') {
              showProgressDialog();
            }
          }
        }
      });

      let printTimer: any;
      socket.on('print', (event: any) => {
        if (event.action === 'start') {
          sortedLogs.value = [];
          logs.value = {};
          printTimer = new Date();
          options.value.status.locked = '1';
          options.value.status.printed = undefined;
          showProgressDialog();
        }
        if (event.action === 'end') {
          const log = {
            start: printTimer,
            end: new Date(),
            command: 'print',
            msg: 'printing done',
            log: event.pdfs.join('\n'),
            progress: 1
          };
          sortedLogs.value.unshift(log);
          logs.value['printing done'] = log;
          options.value.status.locked = '0';
          options.value.status.printed = new Date().getTime().toString();
        }
      });

      let annotateTimer: any;
      socket.on('annotate', (event: any) => {
        if (event.action === 'start') {
          sortedLogs.value = [];
          logs.value = {};
          annotateTimer = new Date();
          options.value.status.locked = '1';
          options.value.status.annotated = undefined;
          showProgressDialog();
        }
        if (event.action === 'end') {
          const log = {
            start: annotateTimer,
            end: new Date(),
            command: 'print',
            msg: 'annotating done',
            log: '',
            type: event.type,
            file: event.file,
            progress: 1
          };
          sortedLogs.value.unshift(log);
          logs.value['annotating done'] = log;
          options.value.status.locked = '0';
          options.value.status.annotated = new Date().getTime().toString();
        }
      });
    },
    unloadProject,
    showProgressDialog,
    loadOptions,
    saveOptions() {
      return $http.value.post(API_URL.value + '/project/' + project.value + '/options', {
        options: options.value.options
      });
    },
    deleteGraphics(graphics: { id: string; name: string }) {
      return $http.value.post(API_URL.value + '/project/' + project.value + '/graphics/delete', {
        id: graphics.id,
        filename: graphics.name
      });
    },
    uploadGraphics(graphics: Graphics, file: File, excalidraw?: string) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('id', graphics.id);
      if (graphics.name.endsWith('.excalidraw') && excalidraw) {
        formData.append('excalidraw', excalidraw);
      }
      return $http.value.post(
        API_URL.value + '/project/' + project.value + '/upload/graphics',
        formData
      );
    },
    preview(data: ExamData) {
      return $http.value.post(API_URL.value + '/project/' + project.value + '/preview', data);
    },
    print(data: ExamData) {
      return $http.value
        .post(API_URL.value + '/project/' + project.value + '/print', data)
        .catch((msg) => {
          console.error(msg);
          Notify.create({
            type: 'negative',
            message: msg,
            position: 'top-right'
          });
        });
    },
    copyProject(src: string, dest: string) {
      return $http.value
        .post(API_URL.value + '/project/' + src + '/copy/project', {
          project: dest
        })
        .catch((msg) => {
          console.error(msg);
          Notify.create({
            type: 'negative',
            message: msg,
            position: 'top-right'
          });
        });
    },
    copyGraphics(src: string, dest: string) {
      return $http.value
        .post(API_URL.value + '/project/' + src + '/copy/graphics', {
          project: dest
        })
        .catch((msg) => {
          console.error(msg);
          Notify.create({
            type: 'negative',
            message: msg,
            position: 'top-right'
          });
        });
    },
    copyCodes(src: string, dest: string) {
      return $http.value
        .post(API_URL.value + '/project/' + src + '/copy/codes', {
          project: dest
        })
        .catch((msg) => {
          console.error(msg);
          Notify.create({
            type: 'negative',
            message: msg,
            position: 'top-right'
          });
        });
    },
    deleteProject() {
      return $http.value.post(API_URL.value + '/project/' + project.value + '/delete');
    },
    renameProject(name: string) {
      return $http.value
        .post(API_URL.value + '/project/' + project.value + '/rename', {
          name: name
        })
        .then((res: any) => {
          return res.data;
        });
    },
    addUser(username: string, project: string) {
      return $http.value.post(API_URL.value + '/project/' + project + '/add', {
        username: username
      });
    },
    removeUser(username: string, project: string) {
      return $http.value.post(API_URL.value + '/project/' + project + '/remove', {
        username: username
      });
    },
    setZoneManual(project: string, zone: PageZone) {
      return $http.value.post(API_URL.value + '/project/' + project + '/capture/setmanual', zone);
    },
    setPageAuto(project: string, page: Page) {
      return $http.value.post(API_URL.value + '/project/' + project + '/capture/setauto', page);
    },
    loadHistory() {
      return $http.value.get(API_URL.value + '/project/' + project.value + '/gitlogs');
    },
    revertGit(sha: string) {
      return $http.value
        .post(API_URL.value + '/project/' + project.value + '/revert', {
          sha: sha
        })
        .then((resp) => {
          const examStore = useExamStore();
          examStore.importJSON(resp.data);
          router.push({ name: 'Edit', params: { project: project.value } });
        });
    },
    changePassword(password: string, newPassword: string) {
      return $http.value.post(API_URL.value + '/changePassword', {
        username: store.user?.username,
        password: password,
        newPassword: newPassword
      });
    },
    // options URL
    downloadURL() {
      return `${API_URL.value}/project/${project.value}/zip?token=${store.token}`;
    },
    downloadODSURL() {
      return `${API_URL.value}/project/${project.value}/ods?token=${store.token}`;
    },
    downloadCSVURL() {
      return `${API_URL.value}/project/${project.value}/static/students.csv?token=${store.token}`;
    },
    scoringURL() {
      return `${API_URL.value}/project/${project.value}/scoring?token=${store.token}`;
    },
    markURL() {
      return `${API_URL.value}/project/${project.value}/mark?token=${store.token}`;
    },
    resetLockURL() {
      return `${API_URL.value}/project/${project.value}/reset/lock?token=${store.token}`;
    },
    dbVersionsURL() {
      return `${API_URL.value}/project/${project.value}/dbversions?token=${store.token}`;
    },
    getDataJson() {
      return $http.value
        .get(`${API_URL.value}/project/${project.value}/static/data.json?token=${store.token}`)
        .then((r) => {
          return r.data;
        })
        .catch(() => {
          return;
        });
    },
    getCsvFields() {
      return $http.value.get(`${API_URL.value}/project/${project.value}/csv`).then((r) => {
        const result = Papa.parse(r.data as string, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true
        });
        const fields = result.meta.fields;
        fields?.sort();
        return fields;
      });
    }
  };
});
