'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:HomeCtrl
 * @description
 * # HomeCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('HomeCtrl', function ($state, auth, API) {

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
        $state.go('edit', {project: project});
      };

      home.createProject = function(){
        home.error = '';
        API.createProject(home.newProjectName)
        .success(function(){
          home.openProject(home.newProjectName);
          home.newProjectName = '';
        })
        .error(function(data){
          home.error = {error: data};
        });
      };


      if(home.isAuthed()){
        getProjectList();
      }




      var socket = io.connect('http://192.168.59.103:9001');
      socket.on('connect', function () {
        socket.on('authenticated', function () {
          //do other things
        });
        socket.emit('authenticate', {token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwiaWF0IjoxNDM3ODI2MjUzfQ.tg8Vw_n-g3yo_5QuAFk6fEFUly2NZNZCnqDqf81vVXE'}); //send the jwt
      });
      socket.on('unauthorized', function(data){
        console.log(data);
      });
      socket.on("error", function(error) {
        console.log(error);
        if (error.type === "UnauthorizedError" || error.code === "invalid_token") {
          // redirect user to login page perhaps?
          console.log("User's token has expired");
        }
      });
  });
