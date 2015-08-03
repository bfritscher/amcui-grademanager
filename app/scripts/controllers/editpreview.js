'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:EditpreviewCtrl
 * @description
 * # EditpreviewCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('EditPreviewCtrl', function ($mdDialog, API, $stateParams, auth, $sce) {
	  var ctrl = this;
    ctrl.api = API;
	  ctrl.previewSrc = function(){
	      return $sce.trustAsUrl( API.URL + '/project/' + $stateParams.project + '/static/out/out.pdf?token=' + auth.getToken() );
	  };

    ctrl.getErr = function(){
        if(ctrl.api.logs && ctrl.api.logs.preview){
           return ctrl.api.logs.preview.log.match(/ERR:.*/g);
        }
    };

    ctrl.getWarn = function(){
      if(ctrl.api.logs && ctrl.api.logs.preview){
        return ctrl.api.logs.preview.log.match(/pdfTeX warning.*/g);
      }
    };

    ctrl.getFull = function(){
      if(ctrl.api.logs && ctrl.api.logs.preview){
        return ctrl.api.logs.preview.log.match(/(?:Over|Under)full.*/g);
      }
    };

    ctrl.logOptions = {
      lineNumbers: false,
  		lineWrapping: false,
  		viewportMargin: Infinity,
  		readOnly: true
    };

	  ctrl.closeDialog = function() {
          $mdDialog.hide();
      };
  });
