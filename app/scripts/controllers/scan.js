/**
 * @ngdoc function
 * @name grademanagerApp.controller:AboutCtrl
 * @description
 * # AboutCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
    .controller('ScanCtrl', function ($scope, $mdMedia, $http, $state, $stateParams, API, Upload, $mdDialog) {
        'use strict';
        var scan = this;
        API.loadProject($stateParams.project);
        $scope.$mdMedia = $mdMedia;

        scan.orderBy = 'id';
        scan.reverse = false;
        scan.uploads = [];
        scan.sort = function (field) {
            if (field === scan.orderBy) {
                scan.reverse = !scan.reverse;
            } else {
                scan.orderBy = field;
            }
        };

        this.loadPage = function (page) {
            scan.page = page;
            page.project = $stateParams.project;
            $state.go('scan.manual', page);
        };

        this.delete = function (page) {
            return $http.post(API.URL + '/project/' + $stateParams.project + '/capture/delete', page)
                .then(function () {
                    scan.pages.splice(scan.pages.indexOf(page), 1);
                });
        };

        function deleteAll() {
            if (scan.pages.length > 0) {
                scan.delete(scan.pages[0]).then(deleteAll);
            }
        }

        this.deleteAll = function () {
            $mdDialog.show($mdDialog.confirm()
            .title('Warning!')
            .content('This will remove all scans, grades and matchings. Do you want to continue?')
            .ok('Delete All')
            .cancel('Cancel'))
            .then(deleteAll);

        };

        $scope.$watch('scan.files', function () {
            function upload(file) {
                scan.uploads.push(file);
                Upload.upload({
                    url: API.URL + '/project/' + $stateParams.project + '/upload',
                    file: file
                }).progress(function (evt) {
                    file.progress = 100.0 * evt.loaded / evt.total;
                }).then(function () {
                    //TODO: better way #47
                    loadData();
                });
            }
            // for now disable multiplefiles at once until server has proper queue.
            if (scan.files) {
                upload(scan.files);
            }
            /*
            if (scan.files && scan.files.length) {
                var files = scan.files.slice(0);
                for (var i = 0; i < files.length; i++) {
                    upload(files[i]);
                }
            }
            */
        });

        function loadData() {
            //TODO move to service? #47
            $http.get(API.URL + '/project/' + $stateParams.project + '/capture')
                .then(function (r) {
                    var data = r.data;
                    scan.pages = data;
                    if ($state.params.student && $state.params.page && $state.params.copy) {
                        for (var i = 0; i < data.length; i++) {
                            if (data[i].id === $state.params.student + '/' + $state.params.page + ':' + $state.params.copy) {
                                scan.page = data[i];
                            }
                        }
                    }
                });

            $http.get(API.URL + '/project/' + $stateParams.project + '/missing')
                .then(function (r) {
                    scan.missing = r.data;
                });
        }
        loadData();

    });
