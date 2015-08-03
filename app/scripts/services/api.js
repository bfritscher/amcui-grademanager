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
            console.log('msg', data);
            self.connected = data;
            $rootScope.$apply();
        });

        self.socket.on('user:connected', function(data){
            console.log('msg', data);
            self.connected[data.id] = data;
            $rootScope.$apply();
        });

        self.socket.on('user:disconnected', function(data){
            console.log('msg', data);
            delete self.connected[data.id];
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
