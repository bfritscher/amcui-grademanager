'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:AboutCtrl
 * @description
 * # AboutCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('ScanCtrl', function ($http, $state) {
    var scan = this;
    $http.get('http://192.168.59.103:9001/capture')
    .success(function(data){
      scan.pages = data;
    });
    this.loadPage = function(page){
      scan.page = page;
      $state.go('scan.manual', page);
    };
    $http.get('http://192.168.59.103:9001/missing')
    .success(function(data){
      scan.missing = data;
    });
  });
