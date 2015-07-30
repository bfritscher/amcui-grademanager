'use strict';

/**
 * @ngdoc filter
 * @name grademanagerApp.filter:htmlToPlaintext
 * @function
 * @description
 * # htmlToPlaintext
 * Filter in the grademanagerApp.
 */
angular.module('grademanagerApp')
  .filter('htmlToPlaintext', function () {
    return function(text) {
      return String(text).replace(/<[^>]+>/gm, '').replace(/&nbsp;/gm, ' ');
    };
  });
