'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:AdminStatsCtrl
 * @description
 * # AdminStatsCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('AdminStatsCtrl', function (API, $http) {
    var ctrl = this;
    $http.get(API.URL + '/admin/stats')
    .then(function(res){
        ctrl.stats = res.data;
        ctrl.stats.projects = {};
        ctrl.stats.roles.forEach(function(p){
            ctrl.stats.projects[p] = [];
        });
        ctrl.keys(ctrl.stats.users).forEach(function(u){
            ctrl.stats.users[u].forEach(function(p){
                ctrl.stats.projects[p].push(u);
            });
        });
    });

    ctrl.keys = function(obj){
        if(obj){
            return Object.keys(obj);
        } else {
            return [];
        }
    };
  });
