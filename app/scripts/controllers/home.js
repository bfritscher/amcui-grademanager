'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:HomeCtrl
 * @description
 * # HomeCtrl
 * Controller of the grademanagerApp
 */

angular.module('grademanagerApp')
  .controller('HomeCtrl', function ($scope, $state, auth, API) {

      var home = this;

      home.projects = [];

      function getProjectList(){
        API.getProjectList().success(function(list){
            home.projects = list;
          });
      }

      home.isAuthed = function(){
        return auth.isAuthed();
      };

      home.logout = function(){
        auth.logout();
      };

      home.login = function(){
        home.error = '';
        auth.login(home.username, home.password)
        .error(function(data, status){
          home.error = {error: data};
          console.log('test', data, status);
        })
        .success(getProjectList);
      };

      home.openProject = function(project){
        //TODO: state based on project status? or last open?
        if (project.status && project.status.printed){
          $state.go( 'scan', {project: project.project});
        } else {
          $state.go( 'edit', {project: project.project});
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


      if(home.isAuthed()){
        getProjectList();
      }

  });
