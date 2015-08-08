'use strict';

/**
 * @ngdoc service
 * @name grademanagerApp.authInterceptor
 * @description
 * # authInterceptor
 * Factory in the grademanagerApp.
 */
angular.module('grademanagerApp')
  .factory('authInterceptor', function ($injector, $q) {
    return {
      request: function(config) {
        var auth = $injector.get('auth');
        var API = $injector.get('API');
        var token = auth.getToken();
        if(config.url.indexOf(API.URL) === 0 && token) {
          config.headers.Authorization = 'Bearer ' + token;
        }

        return config;
      },
      // If a token was sent back, save it
      response: function(res) {
        var auth = $injector.get('auth');
        var API = $injector.get('API');
        if(res.config.url.indexOf(API.URL) === 0 && res.data.token) {
          auth.saveToken(res.data.token);
        }
        return res;
      },
      'responseError': function(response) {
          if (response && response.status === 401) {
              var auth = $injector.get('auth');
              auth.logout();
          }

        return $q.reject(response);
      }
    };
  });
