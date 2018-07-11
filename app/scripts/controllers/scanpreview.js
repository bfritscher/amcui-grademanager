/**
 * @ngdoc function
 * @name grademanagerApp.controller:ScanpreviewCtrl
 * @description
 * # ScanpreviewCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
    .controller('ScanPreviewCtrl', function ($http, $mdMedia, $mdSidenav, $stateParams, $sce, API, auth) {
        'use strict';
        var preview = this;
        $http.get(API.URL + '/project/' + $stateParams.project + '/capture/' + $stateParams.student + '/' + $stateParams.page + ':' + $stateParams.copy)
            .then(function (r) {
                preview.page = r.data;
            });
        $http.get(API.URL + '/project/' + $stateParams.project + '/zones/' + $stateParams.student + '/' + $stateParams.page + ':' + $stateParams.copy)
            .then(function (r) {
                preview.zones = r.data;
            });

        if ($mdMedia('sm')) {
            $mdSidenav('right').open();
        }

        this.pageSrc = function () {
            if (preview.page && preview.page.layout_image) {
                return $sce.trustAsResourceUrl(API.URL + '/project/' + $stateParams.project + '/static/cr/' + preview.page.layout_image + '?token=' + auth.getToken());
            }
            return '';
        };

        preview.ticked = function (zone) {
            if (zone.manual >= 0) {
                return zone.manual === 1;
            }
            if (zone.total <= 0) {
                return false;
            }
            return zone.black >= API.options.options.seuil * zone.total;
        };

        preview.toggle = function (zone) {  
            if (zone.manual === 0) {
                zone.manual = 1;
            } else if (zone.manual === 1) {
                zone.manual = 0;
            } else {
                zone.manual = zone.black >= API.options.options.seuil * zone.total ? 0 : 1;
            }
            API.setZoneManual($stateParams.project, {
                student: $stateParams.student,
                page: $stateParams.page,
                copy: $stateParams.copy,
                manual: zone.manual,
                type: 4,
                id_a: zone.question,
                id_b: zone.answer
            });
        };

        preview.clear = function () {
            preview.zones.forEach(function (z) {
                z.manual = -1;
            });
            API.setPageAuto($stateParams.project, {
                student: $stateParams.student,
                page: $stateParams.page,
                copy: $stateParams.copy
            });
        };

    });
