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
                .then(function () {
                    profile.oldPassword = '';
                    profile.password = '';
                    profile.password2 = '';

                }, function (data) {
                    profile.error = { error: data };
                });
        };

        profile.addU2f = function () {
            auth.u2fRegister(profile.u2fPassword)
                .then(function (r) {
                    //show add key and validate
                    profile.u2ferror = { error: 'Please insert U2F Key!' };
                    $window.u2f.register('https://amcui.ig.he-arc.ch', [r.data.u2f], [], function (answer) {
                        profile.u2ferror = { error: 'Thank you!' };
                        auth.u2fReply(auth.getUsername(), answer)
                            .catch(function (data) {
                                profile.u2ferror = { error: data };
                            });
                    });
                }, function (r) {
                    profile.u2ferror = { error: r.data };
                });
        };

        profile.removeU2f = function () {
            auth.u2fRemove()
            .then(auth.logout, function (data) {
                profile.u2ferror = { error: data };
            });
        };


    });
