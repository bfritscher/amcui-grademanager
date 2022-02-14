import axios, { AxiosInstance } from 'axios';
import Papa from 'papaparse';
import io from 'socket.io-client';
import { Project } from '../components/models';
import { Store } from 'vuex';
import { StateInterface } from '../store';
import { Router } from 'vue-router';
import { Dialog, Notify } from 'quasar';
import { ExamData, Page, PageZone, Options } from '../components/models';
import ProgressDialog from '../components/ProgressDialog.vue';
import * as Sentry from '@sentry/vue';

export default class Api {
  store: Store<StateInterface>;
  router: Router;
  URL: string;
  PROJECT_URL: string;
  project: string;
  options: Options;
  connected: any;
  logs: any;
  sortedLogs: any;
  typeOfScan = [
    { value: '0', label: 'Different answer sheets' },
    { value: '1', label: 'Some answer sheets were photocopied' },
  ];
  $http: AxiosInstance;
  socket: any;

  constructor({
    store,
    router,
  }: {
    store: Store<StateInterface>;
    router: Router;
  }) {
    this.store = store;
    this.router = router;
    this.URL = process.env.AMCUI_API;
    this.PROJECT_URL = '';
    this.project = '';
    this.options = {
      users: [],
      options: {},
      status: {
        locked: '0',
      },
    };
    this.connected = {};
    this.logs = {};
    this.sortedLogs = [];
    // axios instance with interceptor
    this.$http = axios.create();
    this.$http.interceptors.request.use((config) => {
      if (config && config.headers && this.store.state.token) {
        config.headers.Authorization = `Bearer ${this.store.state.token}`;
      }
      return config;
    });
    this.$http.interceptors.response.use(
      (response: any) => {
        if (response.data && response.data.token) {
          this.store.dispatch('SET_TOKEN', response.data.token);
        }
        return response;
      },
      (error) => {
        if (error.response.status === 401) {
          this.store.dispatch('LOGOUT');
        }
        return Promise.reject(error);
      }
    );
  }

  getTemplates() {
    return this.$http.get(this.URL + '/templates').then((r: any) => r.data);
  }

  getProjectList() {
    return this.$http.get(this.URL + '/project/list').then((r: any) => {
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
      this.store.commit('SET_PROJECTS', projects);
      this.$http.get(this.URL + '/project/recent').then((r: any) => {
        const list: string[] = r.data;
        const projectsRecent: Project[] = [];
        list.forEach((key) => {
          if (projectsIndex.hasOwnProperty(key)) {
            projectsRecent.push(projectsIndex[key]);
          }
        });
        this.store.commit('SET_PROJECTS_RECENT', projectsRecent);
      });
    });
  }

  createProject(project: string) {
    return this.$http.post(this.URL + '/project/create', { project: project });
  }

  newLog(name: string) {
    this.logs[name] = {
      msg: name,
      log: '',
      err: '',
      progress: 0,
      start: new Date(),
    };
    this.sortedLogs.unshift(this.logs[name]);
    return this.logs[name];
  }

  getLog(name: string) {
    if (!this.logs.hasOwnProperty(name)) {
      this.newLog(name);
    }
    return this.logs[name];
  }

  getDownloadZipURL() {
    return (
      this.URL +
      '/project/' +
      this.project +
      '/zip/pdf?token=' +
      this.store.state.token
    );
  }

  getAnnotateZipURL() {
    return (
      this.URL +
      '/project/' +
      this.project +
      '/zip/annotate?token=' +
      this.store.state.token
    );
  }

  getStaticFileURL(file: string) {
    return (
      this.URL +
      '/project/' +
      this.project +
      '/static/' +
      file +
      '?token=' +
      this.store.state.token
    );
  }

  loadTemplate(name: string) {
    return this.$http
      .post(this.URL + '/project/' + this.project + '/copy/template', {
        template: name,
      })
      .then((response: any) => response.data);
  }

  loadProject(project: string) {
    if (this.project === project) return;
    Sentry.setUser({ username: this.store.state.user.username });
    Sentry.setContext('project', {
      name: project,
    });

    this.project = project;
    this.PROJECT_URL = this.URL + '/project/' + this.project;
    this.newLog('connecting');
    if (this.socket) {
      this.socket.disconnect();
    }

    let origin = '';
    let path = '/socket.io/';
    if (this.URL.startsWith('http')) {
       const url = new URL(this.URL);
       origin = url.origin;
        path = url.pathname + path;
    } else {
      origin = window.location.origin;
      path = this.URL + path;
    }
    this.socket = io(origin, {
      auth: { token: `Bearer ${this.store.state.token}` },
      path: path,
    });

    this.loadOptions();

    this.socket.on('connect', () => {
      const log = this.getLog('connecting');
      log.end = new Date();
      log.progress = 1;
    });

    this.socket.on('connect_error', () => {
      const log = this.getLog('connecting');
      log.end = new Date();
      log.progress = 1;
      log.code = 1;
      log.err = 'Socket connection error, retrying, check firewall.';
      this.options.status.locked = '0';
      this.showProgressDialog();
    });

    this.socket.on('reconnect_failed', (error: any) => {
      Notify.create({
        type: 'negative',
        message: 'Error reconnecting socket!',
        position: 'top-right',
      });
      console.log('socket error:', error);
    });

    this.socket.on('user:online', (data: any) => {
      this.connected = data;
    });

    this.socket.on('user:connected', (data: any) => {
      this.connected[data.id] = data;
    });

    this.socket.on('user:disconnected', (data: any) => {
      delete this.connected[data.id];
    });

    this.socket.on('update:options', (options: any) => {
      this.options.options = options;
    });

    let logLocal;

    this.socket.on('log', (log: any) => {
      if (log.action === 'start') {
        logLocal = this.newLog(log.msg as string);
        logLocal.command = log.command;
        logLocal.params = log.params;

        if (log.command === 'getimages') {
          this.showProgressDialog();
        }
      } else {
        //ensure a log exisits if joinging after start
        logLocal = this.getLog(log.msg as string);
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
        this.logs[log.msg].err += log.data;
      }

      if (log.action === 'end') {
        logLocal.code = log.code;
        logLocal.progress = 1;
        logLocal.end = new Date();
        if (log.code > 0) {
          this.options.status.locked = '0';
          if (log.msg !== 'preview') {
            this.showProgressDialog();
          }
        }
      }
    });

    let printTimer: any;
    this.socket.on('print', (event: any) => {
      if (event.action === 'start') {
        this.sortedLogs = [];
        this.logs = {};
        printTimer = new Date();
        this.options.status.locked = '1';
        this.options.status.printed = undefined;
        this.showProgressDialog();
      }
      if (event.action === 'end') {
        const log = {
          start: printTimer,
          end: new Date(),
          command: 'print',
          msg: 'printing done',
          log: event.pdfs.join('\n'),
          progress: 1,
        };
        this.sortedLogs.unshift(log);
        this.logs['printing done'] = log;
        this.options.status.locked = '0';
        this.options.status.printed = new Date().getTime().toString();
      }
    });

    let annotateTimer: any;
    this.socket.on('annotate', (event: any) => {
      if (event.action === 'start') {
        this.sortedLogs = [];
        this.logs = {};
        annotateTimer = new Date();
        this.options.status.locked = '1';
        this.options.status.annotated = undefined;
        this.showProgressDialog();
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
          progress: 1,
        };
        this.sortedLogs.unshift(log);
        this.logs['annotating done'] = log;
        this.options.status.locked = '0';
        this.options.status.annotated = new Date().getTime().toString();
      }
    });

    this.socket.emit('listen', this.project);
  }

  isProgressDialog = false;
  showProgressDialog() {
    if (this.isProgressDialog) return;
    this.isProgressDialog = true;
    Dialog.create({
      component: ProgressDialog,
      persistent: true,
      noEscDismiss: true,
      noBackdropDismiss: true,
    }).onDismiss(() => {
      this.isProgressDialog = false;
    });
  }

  loadOptions() {
    this.$http
      .get(this.URL + '/project/' + this.project + '/options')
      .then((r) => {
        const data: any = r.data;
        this.options.users = data.users || [];
        this.options.users.sort();
        this.options.options = data.options || {};
        this.options.status = Object.assign({ locked: '0' }, data.status);
        if (this.options.status.locked != '0') {
          this.showProgressDialog();
        }
      });
  }

  saveOptions() {
    const options = this.options.options;
    return this.$http.post(this.URL + '/project/' + this.project + '/options', {
      options,
    });
  }

  deleteGraphics(graphics: { id: string; name: string }) {
    return this.$http.post(
      this.URL + '/project/' + this.project + '/graphics/delete',
      {
        id: graphics.id,
        filename: graphics.name,
      }
    );
  }

  preview(data: ExamData) {
    return this.$http.post(
      this.URL + '/project/' + this.project + '/preview',
      data
    );
  }

  print(data: ExamData) {
    return this.$http
      .post(this.URL + '/project/' + this.project + '/print', data)
      .catch((msg) => {
        console.error(msg);
        Notify.create({
          type: 'negative',
          message: msg,
          position: 'top-right',
        });
      });
  }

  copyProject(src: string, dest: string) {
    return this.$http
      .post(this.URL + '/project/' + src + '/copy/project', {
        project: dest,
      })
      .catch((msg) => {
        console.error(msg);
        Notify.create({
          type: 'negative',
          message: msg,
          position: 'top-right',
        });
      });
  }

  copyGraphics(src: string, dest: string) {
    return this.$http
      .post(this.URL + '/project/' + src + '/copy/graphics', {
        project: dest,
      })
      .catch((msg) => {
        console.error(msg);
        Notify.create({
          type: 'negative',
          message: msg,
          position: 'top-right',
        });
      });
  }

  copyCodes(src: string, dest: string) {
    return this.$http
      .post(this.URL + '/project/' + src + '/copy/codes', {
        project: dest,
      })
      .catch((msg) => {
        console.error(msg);
        Notify.create({
          type: 'negative',
          message: msg,
          position: 'top-right',
        });
      });
  }

  deleteProject() {
    return this.$http.post(this.URL + '/project/' + this.project + '/delete');
  }

  renameProject(name: string) {
    return this.$http
      .post(this.URL + '/project/' + this.project + '/rename', {
        name: name,
      })
      .then((res: any) => {
        return res.data;
      });
  }

  addUser(username: string, project: string) {
    return this.$http.post(this.URL + '/project/' + project + '/add', {
      username: username,
    });
  }

  removeUser(username: string, project: string) {
    return this.$http.post(this.URL + '/project/' + project + '/remove', {
      username: username,
    });
  }

  setZoneManual(project: string, zone: PageZone) {
    return this.$http.post(
      this.URL + '/project/' + project + '/capture/setmanual',
      zone
    );
  }

  setPageAuto(project: string, page: Page) {
    return this.$http.post(
      this.URL + '/project/' + project + '/capture/setauto',
      page
    );
  }

  loadHistory() {
    return this.$http.get(this.URL + '/project/' + this.project + '/gitlogs');
  }

  revertGit(sha: string) {
    return this.$http
      .post(this.URL + '/project/' + this.project + '/revert', {
        sha: sha,
      })
      .then((resp) => {
        // diffsync must be loaded to import redirect to edit
        localStorage.setItem('AMCUI_IMPORT_KEY', JSON.stringify(resp.data));
        this.router.push({ name: 'Edit', params: { project: this.project } });
      });
  }

  changePassword(password: string, newPassword: string) {
    return this.$http.post(this.URL + '/changePassword', {
      username: this.store.state.user.username,
      password: password,
      newPassword: newPassword,
    });
  }

  // options URL
  downloadURL() {
    return `${this.URL}/project/${this.project}/zip?token=${this.store.state.token}`;
  }
  downloadODSURL() {
    return `${this.URL}/project/${this.project}/ods?token=${this.store.state.token}`;
  }
  downloadCSVURL() {
    return `${this.URL}/project/${this.project}/static/students.csv?token=${this.store.state.token}`;
  }
  scoringURL() {
    return `${this.URL}/project/${this.project}/scoring?token=${this.store.state.token}`;
  }
  markURL() {
    return `${this.URL}/project/${this.project}/mark?token=${this.store.state.token}`;
  }
  resetLockURL() {
    return `${this.URL}/project/${this.project}/reset/lock?token=${this.store.state.token}`;
  }

  getCsvFields() {
    return this.$http
      .get(`${this.URL}/project/${this.project}/csv`)
      .then((r: any) => {
        const result = Papa.parse(r.data as string, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
        });
        const fields = result.meta.fields;
        fields?.sort();
        return fields;
      });
  }
}
