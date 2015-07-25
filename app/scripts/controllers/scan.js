'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:AboutCtrl
 * @description
 * # AboutCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('ScanCtrl', function ($http, $state, $stateParams, API) {
    var scan = this;
    scan.orderBy = 'id';
    scan.reverse = false;
    scan.sort = function(field){
      if (field === scan.orderBy){
        scan.reverse = ! scan.reverse;
      } else {
        scan.orderBy = field;
      }
    };

    this.loadPage = function(page){
      scan.page = page;
      page.project = $stateParams.project;
      $state.go('scan.manual', page);
    };

    //TODO move to service?
    $http.get(API.URL + '/project/' + $stateParams.project +'/capture')
    .success(function(data){
      scan.pages = data;
    });

    $http.get(API.URL + '/project/' + $stateParams.project +'/missing')
    .success(function(data){
      scan.missing = data;
    });
  });
