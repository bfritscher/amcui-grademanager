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

    ctrl.ERROR_NO_FOLDER = 'Project has no folder!';
    ctrl.ERROR_NOT_IN_DB = 'Project not in DB!';

    //TODO refactor
    function loadData(){
        ctrl.users = [];
        ctrl.projects = [];
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
            return $http.get(API.URL + '/admin/du')
            .then(function(res){
                Object.keys(res.data).forEach(function(p){
                    if (!ctrl.stats.projects.hasOwnProperty(p)) {
                        var project = {
                            name: p,
                            users: [],
                            error: ctrl.ERROR_NOT_IN_DB
                        };
                        ctrl.stats.projects[p] = project;
                        ctrl.projects.push(project);
                    }
                    ctrl.stats.projects[p].size = res.data[p].total;
                    ctrl.stats.projects[p].folders = res.data[p].folders;
                });
                ctrl.projects.forEach(function(p){
                    if (!res.data.hasOwnProperty(p.name)) {
                        p.error = ctrl.ERROR_NO_FOLDER;
                    }
                });
            });
        });
    }
    loadData();

    ctrl.keys = function(obj){
        if(obj){
            return Object.keys(obj);
        } else {
            return [];
        }
    };

    ctrl.importProject = function(project){
        $http.post(API.URL + '/admin/import', {project: project.name});
        loadData();
    };

    ctrl.addToProject = function(project){
        $http.post(API.URL + '/admin/addtoproject', {project: project.name});
        loadData();
    };

    ctrl.removeFromProject = function(project){
        $http.post(API.URL + '/admin/removefromproject', {project: project.name});
        loadData();
    };
  });
