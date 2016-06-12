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
                .success(function (data) {
                    if (data.u2f) {
                        home.error = { error: 'Please insert U2F Key!' };
                        $window.u2f.sign([data.u2f], function (answer) {
                            home.error = { error: 'Thank you!' };
                            auth.u2fReply(home.username, answer)
                                .error(function (data) {
                                    home.error = { error: data };
                                })
                                .success(API.getProjectList);
                        });
                    } else {
                        API.getProjectList(data);
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
            API.createProject(home.newProjectName)
                .success(function () {
                    home.openProject({ project: home.newProjectName.toLowerCase() });
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
                    API.copyProject(item.project, name)
                        .success(function () {
                            home.openProject({ project: name.toLowerCase() });
                        });
                });
        };


        if (home.isAuthed()) {
            API.getProjectList();
        }

    });
