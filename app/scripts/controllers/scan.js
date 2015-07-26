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
      if($state.params.student && $state.params.page && $state.params.copy){
        for(var i=0; i< data.length; i++){
          if(data[i].id === $state.params.student + '/' + $state.params.page + ':' + $state.params.copy){
            scan.page = data[i];
          }
        }
      }
    });

    $http.get(API.URL + '/project/' + $stateParams.project +'/missing')
    .success(function(data){
      scan.missing = data;
    });
  });
