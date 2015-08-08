'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:GraphicsmanagerCtrl
 * @description
 * # GraphicsmanagerCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('GraphicsManagerCtrl', function ($scope, $mdDialog, $stateParams, $http, API, exam, Upload) {
    var ctrl = this;
    ctrl.examService = exam;
    ctrl.uploads = [];
    ctrl.graphics = [];
    ctrl.progress = {};

    //check for new graphics and create them
    //TODO: move somewhere?
    $http.get(API.URL + '/project/' + $stateParams.project + '/graphics/sync')
    .success(function(filenames){
        filenames.forEach(function(filename){
            var id = filename.replace(/(.*)\..*?$/, '$1');
            if(!exam.exam.hasOwnProperty('graphics')){
                exam.exam.graphics = {};
            }
            if(!exam.exam.graphics.hasOwnProperty(id)){
                var graphics = exam.createGraphics();
                graphics.name = filename;
                graphics.id = id;
                exam.addGraphics(graphics);
            }
        });
    });


    $scope.$watch('ctrl.files', function () {
        function upload(file){
            //overwrite existing
            var graphics = exam.getGraphicsByName(file.name);
            if(!graphics){
                graphics = exam.createGraphics();
                graphics.name = file.name;
            }
            var index = ctrl.uploads.indexOf(graphics);
            if(index > -1){
                ctrl.uploads.splice(index, 1);
            }
            ctrl.uploads.unshift(graphics);
            ctrl.progress[graphics.id] = file;
            buildList();
            Upload.upload({
                url: API.URL + '/project/' + $stateParams.project + '/upload/graphics',
                file: file,
                fields: {
                    id: graphics.id
                }
            }).progress(function (evt) {
                file.progress = (100.0 * evt.loaded / evt.total) * 0.8;
                console.log(file.progress);
            }).success(function () {
                file.progress = 100;
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

    function buildList(){
        var items = [];
        for(var key in ctrl.examService.exam.graphics){
            if(ctrl.examService.exam.graphics.hasOwnProperty(key)){
                //add only not new uploads
                if (ctrl.uploads.indexOf(ctrl.examService.exam.graphics[key]) === -1) {
                    items.push(ctrl.examService.exam.graphics[key]);
                }
            }
        }
        items.sort(function(a, b){
            return a.name > b.name ? 1 : -1;
        });
        ctrl.graphics = ctrl.uploads.slice(0).concat(items);
    }


    $scope.$watch('ctrl.examService.exam.graphics', buildList, true);

    ctrl.insertGraphics = function(graphics){
        $mdDialog.hide(graphics.id);
    };

    ctrl.closeDialog = function() {
          $mdDialog.cancel();
      };
  });
