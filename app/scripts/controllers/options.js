'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:OptionsCtrl
 * @description
 * # OptionsCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('OptionsCtrl', function ($scope, $stateParams, $http, $mdToast, auth, API) {
    var ctrl = this;
    API.loadProject($stateParams.project);

    ctrl.options = API.options;
    ctrl.types = ['none', 'circle', 'mark', 'box'];
    ctrl.colors = ['#000000', '#ff0000', '#00ff00', '#0000ff'];

    ctrl.downloadURL = API.URL + '/project/' + $stateParams.project + '/zip?token=' + auth.getToken();
    ctrl.downloadODSURL = API.URL + '/project/' + $stateParams.project + '/ods?token=' + auth.getToken();
    ctrl.downloadCSVURL = API.URL + '/project/' + $stateParams.project + '/static/students.csv?token=' + auth.getToken();
    ctrl.resetLockURL = API.URL + '/project/' + $stateParams.project + '/reset/lock?token=' + auth.getToken();

    ctrl.saveOptions = function(){
      API.saveOptions(ctrl.options.options)
      .success(function(){
         $mdToast.show($mdToast.simple().content('Options saved!').position('top right'));
      });
    };

    $scope.$watch('ctrl.options.users', function(newValues, oldValues){
      var listRemoved = oldValues.filter(function(item){
        return newValues.indexOf(item) < 0;
      });
      listRemoved.forEach(function(username){
        if(username !== auth.getUsername()){
          API.removeUser(username, $stateParams.project);
        } else {
          ctrl.options.users.push(auth.getUsername());
        }
      });
      var listAdded = newValues.filter(function(item){
        return oldValues.indexOf(item) < 0;
      });
      listAdded.forEach(function(username){
        if(username !== auth.getUsername()){
          API.addUser(username, $stateParams.project);
        }
      });
    }, true);

  });
