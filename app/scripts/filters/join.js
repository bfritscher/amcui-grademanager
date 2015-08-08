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
  .filter('join', function () {
    return function(array, char) {
      if(angular.isArray(array)){
        return array.join(char);
      }
      return array;
    };
  });
