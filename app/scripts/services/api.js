'use strict';

/**
 * @ngdoc service
 * @name grademanagerApp.API
 * @description
 * # API
 * Service in the grademanagerApp.
 */
angular.module('grademanagerApp')
  .service('API', function ($http, $window, $rootScope) {
    var self = this;
    self.URL = 'http://192.168.56.101:9001';
    self.project = false;
    self.options = {
      users: [],
      options: {}
    };
    self.connected = {};
    self.logs = {};
    self.sortedLogs = [];

    self.getProjectList = function(){
      return $http.get(self.URL + '/project/list');
    };

    self.createProject = function(project){
      return $http.post(self.URL + '/project/create', {project: project});
    };

    self.loadProject = function(project){
      if (self.project !== project) {
        self.project = project;
        self.PROJECT_URL = self.URL + '/project/' + self.project;
        self.socket = io.connect(self.URL + '?token='+ $window.localStorage.getItem('jwtToken'));

        self.loadOptions();

        self.socket.on('error', function(error) {
            console.log('socket error:', error);
        });

        self.socket.on('user:online', function(data){
            self.connected = data;
            $rootScope.$apply();
        });

        self.socket.on('user:connected', function(data){
            self.connected[data.id] = data;
            $rootScope.$apply();
        });

        self.socket.on('user:disconnected', function(data){
            delete self.connected[data.id];
            $rootScope.$apply();
        });

        self.socket.on('log', function(log){
            if (log.action === 'start') {
                self.logs[log.msg] = {
                    command: log.command,
                    msg: log.msg,
                    params: log.params,
                    log: '',
                    err: '',
                    progress: 0,
                    start: new Date()
                };
                self.sortedLogs.unshift(self.logs[log.msg]);
            }

            if (log.action === 'log') {
                var regex = /===<.*?>=\+(.*)/g;
                var match = regex.exec(log.data);
                if (match){
                    self.logs[log.msg].progress += parseFloat(match[1]);
                } else {
                    self.logs[log.msg].log += log.data + '\n';
                    if (log.command === 'prepare') {
                        self.logs[log.msg].progress+=0.001;
                    }
                }
            }

            if (log.action === 'err') {
                self.logs[log.msg].err += log.data;
            }

            if (log.action === 'end') {
                self.logs[log.msg].code = log.code;
                self.logs[log.msg].progress = 1;
                self.logs[log.msg].end = new Date();
                if (log.code > 0){
                    //TODOUNLOCK screen
                    //display error
                }
            }

            $rootScope.$apply();
        });

        var printTimer;
        self.socket.on('print', function(event){
            if (event.action === 'start') {
                //TODO lock screen
                self.sortedLogs = [];
                printTimer = new Date();
            }
            if (event.action === 'end') {
                self.sortedLogs.unshift({
                    start: printTimer,
                    end: new Date(),
                    command: 'print',
                    msg: 'printing done',
                    log: event.pdfs,
                    progress: 1
                });
                //TODO unlock screen
                //link to zip

            }
            $rootScope.$apply();
        });

        self.socket.emit('listen', self.project);
      }
    };

    self.loadOptions = function(){
      $http.get(self.URL + '/project/' + self.project + '/options')
      .success(function(data){
        self.options.users = data.users;
        self.options.users.sort();
        self.options.options = data.options;
      });
    };

    self.preview = function(data){
        return $http.post(self.URL + '/project/' + self.project + '/preview', data);
    };

    self.print = function(data){
        return $http.post(self.URL + '/project/' + self.project + '/print', data);
    };


    self.addUser = function(username, project){
      return $http.post(self.URL + '/project/' + project + '/add', {username: username});
    };

    self.removeUser = function(username, project){
      return $http.post(self.URL + '/project/' + project + '/remove', {username: username});
    };

    self.setZoneManual = function(project, zone){
      return $http.post(self.URL + '/project/' + project + '/capture/setmanual', zone);
    };

    self.setPageAuto = function(project, page){
      return $http.post(self.URL + '/project/' + project + '/capture/setauto', page);
    };


  });
