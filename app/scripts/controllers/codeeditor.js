/**
 * @ngdoc function
 * @name grademanagerApp.controller:CodeeditorCtrl
 * @description
 * # CodeeditorCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
    .controller('CodeEditorCtrl', function ($mdDialog, $timeout, code) {
        'use strict';
        var ctrl = this;
        ctrl.code = code;

        ctrl.options = function () {
            return {
                mode: code.mode,
                lineNumbers: code.numbers,
                viewportMargin: Infinity,
                matchBrackets: true,
                autoCloseBrackets: true,
                autoCloseTags: true,
                matchTags: { bothTags: true }
            };
        };


        //delay codemirror loading
        $timeout(function () {
            ctrl.load = true;
        }, 500);

        ctrl.closeDialog = function () {
            $mdDialog.hide();
        };
    });
