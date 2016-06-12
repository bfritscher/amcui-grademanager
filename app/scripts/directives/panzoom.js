/**
 * @ngdoc directive
 * @name grademanagerApp.directive:panZoo
 * @description
 * # panZoo
 */
angular.module('grademanagerApp')
    .directive('panZoom', function ($window, $timeout) {
        'use strict';
        return {
            restrict: 'A',
            link: function postLink(scope, element) {
                scope.preview.rotate = true;

                //delay for viewBox to update
                $timeout(function () {
                    var panZoom = svgPanZoom(element[0], {
                        controlIconsEnabled: true,
                        panEnabled: true,
                        zoomEnabled: true,
                        minZoom: 0.5,
                        maxZoom: 10
                    });
                    angular.element($window).bind('resize', function () {
                        panZoom.resize();
                        panZoom.fit();
                        panZoom.center();
                        scope.$apply();
                    });
                });
            }
        };
    });
