'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:ProgressdialogCtrl
 * @description
 * # ProgressdialogCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('ProgressDialogCtrl', function ($mdDialog, API) {
    var ctrl = this;
    ctrl.api = API;

    ctrl.closeDialog = function() {
          $mdDialog.hide();
      };
  });
