/**
 * @ngdoc service
 * @name grademanagerApp.API
 * @description
 * # API
 * Service in the grademanagerApp.
 */
angular.module('grademanagerApp')
    .service('API', function ($injector, $http, $timeout, $rootScope, $mdDialog, $mdToast) {
        'use strict';
        function getAuth() {
            return $injector.get('auth');
        }

        var self = this;
    //  self.URL = 'https://amcui.ig.he-arc.ch';
    //  self.SOCKET_URL = 'https://amcui.ig.he-arc.ch/';
        self.URL = 'http://localhost:9001';
        self.SOCKET_URL = 'http://localhost:9001/';
        self.project = false;
        self.options = {
            users: [],
            options: {},
            status: {}
        };
        self.connected = {};
        self.logs = {};
        self.sortedLogs = [];
        self.projects = [];
        self.projectsRecent = [];
        self.projectsIndex = {};

        self.getProjectList = function () {
            return $http.get(self.URL + '/project/list')
                .then(function (r) {
                    var list = r.data;
                    list.sort(function (a, b) {
                        return a.project > b.project ? 1 : -1;
                    });
                    self.projects = list.map(function (item) {
                        item.short = item.project.split('-')[0];
                        self.projectsIndex[item.project] = item;
                        return item;
                    });
                    $http.get(self.URL + '/project/recent')
                    .then(function (r) {
                        var list = r.data;
                        self.projectsRecent = [];
                        list.forEach(function (key) {
                            if (self.projectsIndex.hasOwnProperty(key)) {
                                self.projectsRecent.push(self.projectsIndex[key]);
                            }
                        });
                    });
                });
        };

        self.createProject = function (project) {
            return $http.post(self.URL + '/project/create', { project: project });
        };

        self.newLog = function (name) {
            self.logs[name] = {
                msg: name,
                log: '',
                err: '',
                progress: 0,
                start: new Date()
            };
            self.sortedLogs.unshift(self.logs[name]);
            return self.logs[name];
        };

        self.getLog = function (name) {
            if (!self.logs.hasOwnProperty(name)) {
                self.newLog(name);
            }
            return self.logs[name];
        };

        self.getDownloadZipURL = function () {
            return self.URL + '/project/' + self.project + '/zip/pdf?token=' + getAuth().getToken();
        };

        self.getAnnotateZipURL = function () {
            return self.URL + '/project/' + self.project + '/zip/annotate?token=' + getAuth().getToken();
        };

        self.getStaticFileURL = function (file) {
            return self.URL + '/project/' + self.project + '/static/' + file + '?token=' + getAuth().getToken();
        };

        self.loadTemplate = function (name) {
            return $http.post(self.URL + '/project/' + self.project + '/copy/template', { template: name });
        };

        self.loadProject = function (project) {
            if (self.project !== project) {
                if (Raven) {
                    Raven.setUserContext({
                        id: getAuth().getUsername()
                    });

                    Raven.setExtraContext({
                        project: project
                    });
                }

                self.project = project;
                self.PROJECT_URL = self.URL + '/project/' + self.project;
                self.newLog('connecting');
                if (self.socket) {
                    self.socket.disconnect();
                }
                self.socket = io.connect(self.SOCKET_URL + '?token=' + getAuth().getToken()); //, {path:'/amcui/socket.io'}

                self.loadOptions();

                self.socket.on('connect', function () {
                    var log = self.getLog('connecting');
                    log.end = new Date();
                    log.progress = 1;
                });

                self.socket.on('connect_error', function () {
                    var log = self.getLog('connecting');
                    log.end = new Date();
                    log.progress = 1;
                    log.code = 1;
                    log.err = 'Socket connection error, retrying, check firewall.';
                    self.options.status.locked = 0;
                    self.showProgressDialog();
                });

                self.socket.on('reconnect_failed', function (error) {
                    $mdToast.show($mdToast.simple().content('Error reconnecting socket!').position('top right'));
                    console.log('socket error:', error);
                });

                self.socket.on('user:online', function (data) {
                    self.connected = data;
                    $rootScope.$apply();
                });

                self.socket.on('user:connected', function (data) {
                    self.connected[data.id] = data;
                    $rootScope.$apply();
                });

                self.socket.on('user:disconnected', function (data) {
                    delete self.connected[data.id];
                    $rootScope.$apply();
                });

                self.socket.on('update:options', function (options) {
                    self.options.options = options;
                    $rootScope.$apply();
                });


                var logLocal;

                self.socket.on('log', function (log) {
                    if (log.action === 'start') {
                        logLocal = self.newLog(log.msg);
                        logLocal.command = log.command;
                        logLocal.params = log.params;

                        if (log.command === 'getimages') {
                            self.showProgressDialog();
                        }

                    } else {
                        //ensure a log exisits if joinging after start
                        logLocal = self.getLog(log.msg);
                    }

                    if (log.action === 'log') {
                        var regex = /===<.*?>=\+(.*)/g;
                        var match = regex.exec(log.data);

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
                        self.logs[log.msg].err += log.data;
                    }

                    if (log.action === 'end') {
                        logLocal.code = log.code;
                        logLocal.progress = 1;
                        logLocal.end = new Date();
                        if (log.code > 0) {
                            self.options.status.locked = 0;
                            if (log.msg !== 'preview') {
                                self.showProgressDialog();
                            }
                        }
                    }

                    $rootScope.$apply();
                });

                var printTimer;
                self.socket.on('print', function (event) {
                    if (event.action === 'start') {
                        self.sortedLogs = [];
                        self.logs = {};
                        printTimer = new Date();
                        self.options.status.locked = 1;
                        self.options.status.printed = undefined;
                        self.showProgressDialog();
                    }
                    if (event.action === 'end') {
                        var log = {
                            start: printTimer,
                            end: new Date(),
                            command: 'print',
                            msg: 'printing done',
                            log: event.pdfs.join('\n'),
                            progress: 1
                        };
                        self.sortedLogs.unshift(log);
                        self.logs['printing done'] = log;
                        self.options.status.locked = 0;
                        self.options.status.printed = new Date().getTime();
                    }
                    $rootScope.$apply();
                });

                var annotateTimer;
                self.socket.on('annotate', function (event) {
                    if (event.action === 'start') {
                        self.sortedLogs = [];
                        self.logs = {};
                        annotateTimer = new Date();
                        self.options.status.locked = 1;
                        self.options.status.annotated = undefined;
                        self.showProgressDialog();
                    }
                    if (event.action === 'end') {
                        var log = {
                            start: annotateTimer,
                            end: new Date(),
                            command: 'print',
                            msg: 'annotating done',
                            log: '',
                            type: event.type,
                            file: event.file,
                            progress: 1
                        };
                        self.sortedLogs.unshift(log);
                        self.logs['annotating done'] = log;
                        self.options.status.locked = 0;
                        self.options.status.annotated = new Date().getTime();
                    }
                    $rootScope.$apply();
                });

                self.socket.emit('listen', self.project);
            }
        };
        self.showProgressDialog = function () {
            $mdDialog.show({
                clickOutsideToClose: false,
                escapeToClose: false,
                hasBackdrop: true,
                templateUrl: 'views/progressdialog.html',
                controller: 'ProgressDialogCtrl',
                controllerAs: 'ctrl'
            });
        };

        self.loadOptions = function () {
            $http.get(self.URL + '/project/' + self.project + '/options')
                .then(self.handleOptions);
        };

        self.handleOptions = function (r) {
            var data = r.data;
            self.options.users = data.users || [];
            self.options.users.sort();
            self.options.options = data.options || {};
            self.options.status = data.status || {};
            if (self.options.status.locked > 0) {
                self.showProgressDialog();
            }
        };

        self.saveOptions = function (options) {
            if (!options) {
                options = self.options.options;
            }
            return $http.post(self.URL + '/project/' + self.project + '/options', { options: options });
        };

        self.deleteGraphics = function (graphics) {
            return $http.post(self.URL + '/project/' + self.project + '/graphics/delete', {
                id: graphics.id,
                filename: graphics.name
            });
        };

        self.preview = function (data) {
            return $http.post(self.URL + '/project/' + self.project + '/preview', data);
        };

        self.print = function (data) {
            return $http.post(self.URL + '/project/' + self.project + '/print', data)
                .catch(function (msg) {
                    $mdToast.show($mdToast.simple().content(msg).position('top right'));
                });
        };

        self.copyProject = function (src, dest) {
            return $http.post(self.URL + '/project/' + src + '/copy/project', {
                project: dest
            })
                .catch(function (msg) {
                    $mdToast.show($mdToast.simple().content(msg).position('top right'));
                });
        };

        self.copyGraphics = function (src, dest) {
            return $http.post(self.URL + '/project/' + src + '/copy/graphics', {
                project: dest
            })
                .catch(function (msg) {
                    $mdToast.show($mdToast.simple().content(msg).position('top right'));
                });
        };

        self.copyCodes = function (src, dest) {
            return $http.post(self.URL + '/project/' + src + '/copy/codes', {
                project: dest
            })
                .catch(function (msg) {
                    $mdToast.show($mdToast.simple().content(msg).position('top right'));
                });
        };

        self.deleteProject = function () {
            return $http.post(self.URL + '/project/' + self.project + '/delete');
        };

        self.renameProject = function (name) {
            return $http.post(self.URL + '/project/' + self.project + '/rename', { name: name });
        };

        self.addUser = function (username, project) {
            return $http.post(self.URL + '/project/' + project + '/add', { username: username });
        };

        self.removeUser = function (username, project) {
            return $http.post(self.URL + '/project/' + project + '/remove', { username: username });
        };

        self.setZoneManual = function (project, zone) {
            return $http.post(self.URL + '/project/' + project + '/capture/setmanual', zone);
        };

        self.setPageAuto = function (project, page) {
            return $http.post(self.URL + '/project/' + project + '/capture/setauto', page);
        };

        self.loadHistory = function () {
            return $http.get(self.URL + '/project/' + self.project + '/gitlogs');
        };

        self.revertGit = function (sha) {
            return $http.post(self.URL + '/project/' + self.project + '/revert', {
                sha: sha
            });
        };


    });
