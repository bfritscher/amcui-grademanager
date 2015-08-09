'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:HomeCtrl
 * @description
 * # HomeCtrl
 * Controller of the grademanagerApp
 */

angular.module('grademanagerApp')
  .controller('HomeCtrl', function ($scope, $state, $mdDialog, auth, exam, API) {

      var home = this;

     home.API = API;

      home.isAuthed = function(){
        return auth.isAuthed();
      };

      home.logout = function(){
        auth.logout();
      };

      home.login = function(){
        home.error = '';
        auth.login(home.username, home.password)
        .error(function(data){
          home.error = {error: data};
        })
        .success(API.getProjectList);
      };

      home.openProject = function(project){

        if (project.status && project.status.annotated){
          $state.go( 'grade', {project: project.project});
        } else if (project.status && project.status.printed){
          $state.go( 'scan', {project: project.project});
        } else {
          $state.go( 'edit', {project: project.project}, {reload: true});
        }


      };

      home.createProject = function(){
        home.error = '';
        API.createProject(home.newProjectName)
        .success(function(){
          home.openProject({project: home.newProjectName});
          home.newProjectName = '';
        })
        .error(function(data){
          home.error = {error: data};
        });
      };

      home.copyProject = function($event, item){
          $mdDialog.show({
              clickOutsideToClose: false,
              targetEvent: $event,
              templateUrl: 'views/promptdialog.html',
              controller: 'PromptDialogCtrl',
              controllerAs: 'ctrl',
              locals: {
                  options: {
                      title: 'Copy project ' + item.project,
                      content: 'Provide a name for the new copy:',
                      label: 'new name',
                      value: ''
                  }
              }
          })
          .then(function(name){
              API.copyProject(item.project, name)
              .success(function(){
                  home.openProject({project: name});
              });
          });
      };


      if(home.isAuthed()){
         API.getProjectList();
      }

  });
