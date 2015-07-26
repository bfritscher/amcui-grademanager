'use strict';

/**
 * @ngdoc service
 * @name grademanagerApp.auth
 * @description
 * # auth
 * Service in the grademanagerApp.
 */
angular.module('grademanagerApp')
  .service('auth', function ($window, API, $http, $state) {
    var self = this;

    self.parseJwt = function(token) {
      var base64Url = token.split('.')[1];
      var base64 = base64Url.replace('-', '+').replace('_', '/');
      return JSON.parse($window.atob(base64));
    };

    self.saveToken = function(token) {
      $window.localStorage.setItem('jwtToken', token);
    };

    self.getToken = function() {
      return $window.localStorage.getItem('jwtToken');
    };

    self.isAuthed = function() {
      var token = self.getToken();
      if(token) {
        var params = self.parseJwt(token);
        return Math.round(new Date().getTime() / 1000) <= params.exp;
      } else {
        $state.go('home');
        return false;
      }
    };

    self.getUsername = function(){
      var token = self.getToken();
      if(token) {
        var params = self.parseJwt(token);
        return params.username;
      } else {
        return '';
      }
    };

    self.login = function(username, password) {
      return $http.post(API.URL + '/login', {
          username: username,
          password: password
        });
    };

    self.logout = function() {
      $window.localStorage.removeItem('jwtToken');
    };
  });
