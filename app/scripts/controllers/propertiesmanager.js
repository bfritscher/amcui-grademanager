/**
 * @ngdoc function
 * @name grademanagerApp.controller:GraphicsmanagerCtrl
 * @description
 * # GraphicsmanagerCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
    .controller('PropertiesManagerCtrl', function ($scope, $mdDialog, exam) {
        'use strict';
        var ctrl = this;
        ctrl.examService = exam;

        ctrl.getProperties = function () {
            return Object.keys(ctrl.examService.exam.properties).sort();
        };

        ctrl.removeProperty = function (key) {
            delete ctrl.examService.exam.properties[key];
        };

        ctrl.closeDialog = function () {
            $mdDialog.cancel();
        };
    });
