/**
 * @ngdoc function
 * @name grademanagerApp.controller:OptionsCtrl
 * @description
 * # OptionsCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
    .controller('OptionsCtrl', function ($scope, $state, $stateParams, $http, $mdToast, auth, API, $window) {
        'use strict';

        var ctrl = this;
        API.loadProject($stateParams.project);

        ctrl.options = API.options;
        ctrl.types = ['none', 'circle', 'mark', 'box'];
        ctrl.colors = ['#000000', '#ff0000', '#00ff00', '#0000ff'];
        ctrl.fields = [];

        ctrl.downloadURL = API.URL + '/project/' + $stateParams.project + '/zip?token=' + auth.getToken();
        ctrl.downloadODSURL = API.URL + '/project/' + $stateParams.project + '/ods?token=' + auth.getToken();
        ctrl.downloadCSVURL = API.URL + '/project/' + $stateParams.project + '/static/students.csv?token=' + auth.getToken();
        ctrl.scoringURL = API.URL + '/project/' + $stateParams.project + '/scoring?token=' + auth.getToken();
        ctrl.markURL = API.URL + '/project/' + $stateParams.project + '/mark?token=' + auth.getToken();
        ctrl.resetLockURL = API.URL + '/project/' + $stateParams.project + '/reset/lock?token=' + auth.getToken();

        ctrl.saveOptions = function () {
            API.saveOptions(ctrl.options.options)
                .success(function () {
                    $mdToast.show($mdToast.simple().content('Options saved!').position('top right'));
                });
        };

        ctrl.deleteProject = function () {
            if ($window.confirm('Are you sure you want to delete all data of ' + API.project + ' ?')) {
                API.deleteProject().then(function () {
                    $state.go('home');
                });
            }
        };

        ctrl.renameProject = function () {
            var name = $window.prompt('New name?');
            if (name) {
                API.renameProject(name).then(function () {
                    $state.go('home');
                });
            }
        };

        //TODO: #121 refactor into service, mabe get only meta from server not full csv!
        $http.get(API.URL + '/project/' + $stateParams.project + '/csv')
            .success(function (csv) {
                var result = Papa.parse(csv, {
                    header: true,
                    dynamicTyping: true,
                    skipEmptyLines: true
                });
                ctrl.fields = result.meta.fields.sort();
            });




        $scope.$watch('ctrl.options.users', function (newValues, oldValues) {
            var listRemoved = oldValues.filter(function (item) {
                return newValues.indexOf(item) < 0;
            });
            listRemoved.forEach(function (username) {
                if (username !== auth.getUsername()) {
                    API.removeUser(username, $stateParams.project);
                } else {
                    ctrl.options.users.push(auth.getUsername());
                }
            });
            var listAdded = newValues.filter(function (item) {
                return oldValues.indexOf(item) < 0;
            });
            listAdded.forEach(function (username) {
                if (username !== auth.getUsername()) {
                    API.addUser(username, $stateParams.project);
                }
            });
        }, true);

    });
