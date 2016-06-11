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
    ctrl.users = [];
    ctrl.projects = [];
    ctrl.tables = {
        users: {
            order: 'username',
            page: 1,
            limit: 10
        },
        projects: {
            order: 'name',
            page: 1,
            limit: 10
        }
    };
    ctrl.promise = $http.get(API.URL + '/admin/stats')
    .then(function(res){
        ctrl.stats = res.data;
        ctrl.stats.projects = {};
        ctrl.stats.roles.forEach(function(p){
            var project = {
                name: p,
                users: []
            };
            ctrl.stats.projects[p] = project;
            ctrl.projects.push(project);
        });

        ctrl.keys(ctrl.stats.users).forEach(function(u){
            ctrl.stats.users[u].forEach(function(p){
                ctrl.stats.projects[p].users.push(u);
            });
            ctrl.users.push({
                username: u,
                projects: ctrl.stats.users[u].sort()
            });
        });
        ctrl.stats.roles.forEach(function(p){
            ctrl.stats.projects[p].users.sort();
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
