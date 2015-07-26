'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:AboutCtrl
 * @description
 * # AboutCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('ScanCtrl', function ($scope, $http, $state, $stateParams, API, Upload) {
    var scan = this;
    scan.orderBy = 'id';
    scan.reverse = false;
    scan.uploads = [];
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

    $scope.$watch('scan.files', function () {
        function upload(file){
            scan.uploads.push(file);
            Upload.upload({
                url: API.URL + '/project/' + $stateParams.project + '/upload',
                file: file
            }).progress(function (evt) {
                file.progress = 100.0 * evt.loaded / evt.total;
            }).success(function () {

            });
        }
        if (scan.files && scan.files.length) {
            var files = scan.files.slice(0);
            for (var i = 0; i < files.length; i++) {
                upload(files[i]);
            }
        }
    });

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
