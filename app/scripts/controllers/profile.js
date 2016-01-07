'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:ProfileCtrl
 * @description
 * # ProfileCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('ProfileCtrl', function ($window, auth) {
    var profile = this;
    profile.changePassword = function(){
        profile.error = '';
        auth.changePassword(profile.oldPassword, profile.password)
        .error(function(data){
          profile.error = {error: data};
        })
        .success(function(){
            profile.oldPassword = '';
            profile.password = '';
            profile.password2 = '';

        });
    };

    profile.addU2f = function(){
        auth.u2fRegister(profile.u2fPassword)
        .error(function(data){
          profile.error = {error: data};
        })
        .success(function(data){
            //show add key and validate
            $window.u2f.register([data.u2f], [], function(answer){
                auth.u2fReply(answer)
                .error(function(data){
                    profile.u2ferror = {error: data};
                });
            });
        });
    };

    profile.removeU2f = function(){
        auth.u2fRemove().error(function(data){
          profile.u2ferror = {error: data};
        })
        .success(auth.logout);
    };


  });
