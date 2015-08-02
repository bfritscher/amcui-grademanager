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
    ctrl.options = {
      users: [],
      options: {}
    };

    ctrl.downloadURL = API.URL + '/project/' + $stateParams.project + '/zip?token=' + auth.getToken();
    ctrl.downloadODSURL = API.URL + '/project/' + $stateParams.project + '/ods?token=' + auth.getToken();
    ctrl.downloadCSVURL = API.URL + '/project/' + $stateParams.project + '/static/students.csv?token=' + auth.getToken();

    $http.get(API.URL + '/project/' + $stateParams.project + '/options')
    .success(function(data){
      ctrl.options = data;
      data.users.sort();
    });

    ctrl.saveOptions = function(){
      $http.post(API.URL + '/project/' + $stateParams.project + '/options', {options: ctrl.options.options})
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
