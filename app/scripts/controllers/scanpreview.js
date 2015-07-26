'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:ScanpreviewCtrl
 * @description
 * # ScanpreviewCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('ScanPreviewCtrl', function ($http, $stateParams, $sce, API, auth) {

    var preview = this;
    $http.get(API.URL + '/project/' + $stateParams.project + '/capture/' + $stateParams.student + '/' + $stateParams.page + ':' + $stateParams.copy)
    .success(function(data){
      preview.page = data;
    });
    $http.get(API.URL + '/project/' + $stateParams.project + '/zones/'+ $stateParams.student + '/' + $stateParams.page + ':' + $stateParams.copy )
    .success(function(data){
      preview.zones = data;
    });

    this.pageSrc = function(){
      if(preview.page && preview.page.layout_image){
        return $sce.trustAsResourceUrl(API.URL + '/project/' + $stateParams.project + '/static/' + preview.page.layout_image + '?token=' + auth.getToken());
      }
    };

    //TODO: get from project config db??
    preview.threshold = 0.5;

    preview.ticked = function(zone){
      if(zone.manual >=0){
        return zone.manual === 1;
      }
      if(zone.total <= 0){
        return false;
      }
      return zone.black >= preview.threshold * zone.total;
    };

    preview.toggle = function(zone){
      if (zone.manual === 0){
        zone.manual = 1;
      } else if(zone.manual === 1){
        zone.manual = 0;
      } else {
        zone.manual = zone.black >= preview.threshold * zone.total ? 0 : 1;
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

    preview.clear = function(){
      preview.zones.forEach(function(z){
        z.manual = -1;
      });
      API.setPageAuto($stateParams.project, {
        student: $stateParams.student,
        page: $stateParams.page,
        copy: $stateParams.copy
      });
    };

  });
