'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:PromptdialogCtrl
 * @description
 * # PromptdialogCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('PromptDialogCtrl', function ($mdDialog, options) {
    var ctrl = this;
    ctrl.options = options;

    ctrl.closeDialog = function() {
          $mdDialog.hide(ctrl.options.value);
      };
  });
