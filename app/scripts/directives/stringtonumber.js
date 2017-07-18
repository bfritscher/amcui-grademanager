/**
 * @ngdoc directive
 * @name grademanagerApp.directive:stringToNumber
 * @description
 * # stringToNumber
 */
angular.module('grademanagerApp')
    .directive('stringToNumber', function () {
        'use strict';
        return {
            require: 'ngModel',
            priority: 1,
            link: function (scope, element, attrs, ngModel) {
                ngModel.$parsers.push(function (value) {
                    return '' + value;
                });
                ngModel.$formatters.push(function (value) {
                    return parseFloat(value, 10);
                });
            }
        };
    });
