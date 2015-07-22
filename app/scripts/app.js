'use strict';

/**
 * @ngdoc overview
 * @name grademanagerApp
 * @description
 * # grademanagerApp
 *
 * Main module of the application.
 */
angular
  .module('grademanagerApp', [
    'ngAnimate',
    'ngMessages',
    'ngRoute',
    'ngSanitize',
    'ngTouch',
    'ngMaterial',
    'ui.tree'
  ])
  .config(function ($routeProvider) {
    $routeProvider
      .when('/edit', {
        templateUrl: 'views/edit.html',
        controller: 'EditCtrl',
        controllerAs: 'editor'
      })
      .when('/scan', {
        templateUrl: 'views/scan.html',
        controller: 'ScanCtrl',
        controllerAs: 'scan'
      })      
      .when('/grade', {
        templateUrl: 'views/grade.html',
        controller: 'GradeCtrl',
        controllerAs: 'grade'
      })
      .otherwise({
        redirectTo: '/'
      });
  });
