'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:GraphicsmanagerCtrl
 * @description
 * # GraphicsmanagerCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('GraphicsManagerCtrl', function ($scope, $mdDialog, $stateParams, API, exam, Upload) {
    var ctrl = this;
    ctrl.examService = exam;
    ctrl.uploads = [];

    $scope.$watch('ctrl.files', function () {
        function upload(file){
            //overwrite existing
            var graphics = exam.getGraphicsByName(file.name);
            if(!graphics){
                graphics = exam.createGraphics();
                graphics.name = file.name;
            }
            ctrl.uploads.push(file);
            Upload.upload({
                url: API.URL + '/project/' + $stateParams.project + '/upload/graphics',
                file: file,
                fields: {
                    id: graphics.id
                }
            }).progress(function (evt) {
                file.progress = 100.0 * evt.loaded / evt.total;
            }).success(function () {
                exam.addGraphics(graphics);
            });
        }

        if (ctrl.files && ctrl.files.length) {
            var files = ctrl.files.slice(0);
            for (var i = 0; i < files.length; i++) {
                upload(files[i]);
            }
        }
    });

    ctrl.insertGraphics = function(graphics){
        $mdDialog.hide(graphics.id);
    };

    ctrl.closeDialog = function() {
          $mdDialog.cancel();
      };
  });
