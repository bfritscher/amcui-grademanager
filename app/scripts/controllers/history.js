'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:OptionsCtrl
 * @description
 * # OptionsCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('HistoryCtrl', function ($state, $stateParams, $mdDialog, API) {
    var ctrl = this;
    API.loadProject($stateParams.project);

    function loadHistory(){
        API.loadHistory()
        .then(function(res){
            ctrl.logs = res.data;
        });
    }
    loadHistory();

    ctrl.restore = function(event, commit) {
        var confirm = $mdDialog.confirm()
            .targetEvent(event)
            .title('Confirm restoring an older version!')
            .content('Warning: Everything will be replaced! With version from ' + commit.date)
            .ok('Replace')
            .cancel('Cancel');
        $mdDialog
        .show( confirm )
        .then(function() {
            API.revertGit(commit.sha)
            .then(function(resp){
                // diffsync must be loaded to import redirect to edit
                localStorage.setItem('import', JSON.stringify(resp.data));
                $state.go('edit', {project: $stateParams.project}, {reload: true});
            });
        });
    };

  });
