/**
 * @ngdoc function
 * @name grademanagerApp.controller:HomeCtrl
 * @description
 * # HomeCtrl
 * Controller of the grademanagerApp
 */

angular.module('grademanagerApp')
    .controller('HomeCtrl', function ($scope, $state, $mdDialog, $window, auth, exam, API) {
        'use strict';
        var home = this;
        home.API = API;

        home.isAuthed = function () {
            return auth.isAuthed();
        };

        home.logout = function () {
            auth.logout();
        };

        home.login = function () {
            home.error = '';
            auth.login(home.username, home.password)
                .error(function (data) {
                    home.error = { error: data };
                })
                .then(function (r) {
                    if (r.data.u2f) {
                        home.error = { error: 'Please insert U2F Key!' };
                        $window.u2f.sign([r.data.u2f], function (answer) {
                            home.error = { error: 'Thank you!' };
                            auth.u2fReply(home.username, answer)
                                .error(function (data) {
                                    home.error = { error: data };
                                })
                                .then(API.getProjectList);
                        });
                    } else {
                        API.getProjectList(r.data);
                    }
                });
        };

        home.openProject = function (project) {

            if (project.status && project.status.annotated) {
                $state.go('grade', { project: project.project });
            } else if (project.status && project.status.printed) {
                $state.go('scan', { project: project.project });
            } else {
                $state.go('edit', { project: project.project }, { reload: true });
            }


        };

        home.createProject = function () {
            home.error = '';
            home.newProjectName = home.newProjectName.trim().toLowerCase();
            API.createProject(home.newProjectName)
                .then(function (r) {
                    home.openProject({ project: r.data });
                    home.newProjectName = '';
                })
                .error(function (data) {
                    home.error = { error: data };
                });
        };

        home.copyProject = function ($event, item) {
            $mdDialog.show({
                clickOutsideToClose: false,
                targetEvent: $event,
                templateUrl: 'views/promptdialog.html',
                controller: 'PromptDialogCtrl',
                controllerAs: 'ctrl',
                locals: {
                    options: {
                        title: 'Copy project ' + item.project,
                        content: 'Provide a name for the new copy:',
                        label: 'new name',
                        value: ''
                    }
                }
            })
                .then(function (name) {
                    name = name.trim().toLowerCase().replace(/[^\-a-z0-9\_]/g, '');
                    API.copyProject(item.project, name)
                        .then(function () {
                            home.openProject({ project: name });
                        });
                });
        };

        $scope.$watch('home.search', function () {
            if (home.search) {
                home.selectedTab = 1;
            }
        });

        if (home.isAuthed()) {
            API.getProjectList();
        }

    });
