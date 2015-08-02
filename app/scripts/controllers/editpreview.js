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
	  this.previewSrc = function(){
	      return $sce.trustAsUrl( API.URL + '/project/' + $stateParams.project + '/static/out/out.pdf?token=' + auth.getToken() );
	  };

	  ctrl.closeDialog = function() {
          $mdDialog.hide();
      };
  });
