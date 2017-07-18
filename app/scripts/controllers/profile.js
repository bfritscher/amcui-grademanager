/**
 * @ngdoc function
 * @name grademanagerApp.controller:ProfileCtrl
 * @description
 * # ProfileCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
    .controller('ProfileCtrl', function ($window, auth) {
        'use strict';
        var profile = this;
        profile.changePassword = function () {
            profile.error = '';
            auth.changePassword(profile.oldPassword, profile.password)
                .error(function (data) {
                    profile.error = { error: data };
                })
                .then(function () {
                    profile.oldPassword = '';
                    profile.password = '';
                    profile.password2 = '';

                });
        };

        profile.addU2f = function () {
            auth.u2fRegister(profile.u2fPassword)
                .error(function (r) {
                    profile.u2ferror = { error: r.data };
                })
                .then(function (r) {
                    //show add key and validate
                    profile.u2ferror = { error: 'Please insert U2F Key!' };
                    $window.u2f.register([r.data.u2f], [], function (answer) {
                        profile.u2ferror = { error: 'Thank you!' };
                        auth.u2fReply(auth.getUsername(), answer)
                            .error(function (data) {
                                profile.u2ferror = { error: data };
                            });
                    });
                });
        };

        profile.removeU2f = function () {
            auth.u2fRemove().error(function (data) {
                profile.u2ferror = { error: data };
            })
                .then(auth.logout);
        };


    });
