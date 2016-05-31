'use strict';

/**
 * @ngdoc overview
 * @name grademanagerApp
 * @description
 * # grademanagerApp
 *
 * Main module of the application.
 */
angular
  .module('grademanagerApp', [
    'ngAnimate',
    'ngMessages',
    'ngRoute',
    'ngSanitize',
    'ngMaterial',
    'ui.tree',
    'ui.router',
    'IeHelper',
    'ngFileUpload',
    'ui.codemirror',
    'validation.match'
  ])
  .config(function ($stateProvider, $urlRouterProvider) {
    $urlRouterProvider.otherwise('/');
    $stateProvider
      .state('home', {
        url: '/',
        templateUrl: 'views/home.html',
        controller: 'HomeCtrl',
        controllerAs: 'home'
      })
      .state('profile', {
        url: '/profile',
        templateUrl: 'views/profile.html',
        controller: 'ProfileCtrl',
        controllerAs: 'profile'
      })
      .state('edit', {
        url: '/:project/edit',
        templateUrl: 'views/edit.html',
        controller: 'EditCtrl',
        controllerAs: 'editor',
        reloadOnSearch: false
      })
      .state('scan', {
        url: '/:project/scan',
        templateUrl: 'views/scan.html',
        controller: 'ScanCtrl',
        controllerAs: 'scan'
      })
      .state('scan.manual', {
        url: '/:student/:page\::copy',
        templateUrl: 'views/scan.preview.html',
        controller: 'ScanPreviewCtrl',
        controllerAs: 'preview'
      })
      .state('grade', {
        url: '/:project/grade',
        templateUrl: 'views/grade.html',
        controller: 'GradeCtrl',
        controllerAs: 'grade'
      })
      .state('options', {
        url: '/:project/options',
        templateUrl: 'views/options.html',
        controller: 'OptionsCtrl',
        controllerAs: 'ctrl'
      })
      .state('history', {
        url: '/:project/history',
        templateUrl: 'views/history.html',
        controller: 'HistoryCtrl',
        controllerAs: 'ctrl'
      })
      .state('admin_stats', {
        url: '/admin/stats',
        templateUrl: 'views/admin/stats.html',
        controller: 'AdminStatsCtrl',
        controllerAs: 'ctrl'
      });
  })
  .config(function($mdIconProvider) {
    $mdIconProvider.defaultFontSet( 'mdi' );
  })
  .config(function($mdThemingProvider) {
    $mdThemingProvider.theme('default')
        .primaryPalette('blue')
        .accentPalette('grey');
  })
  .config(function($httpProvider) {
    $httpProvider.interceptors.push('authInterceptor');
  });

 //http://stackoverflow.com/questions/15895483/angular-ng-href-and-svg-xlink
angular.forEach([
    { ngAttrName: 'ngXlinkHref', attrName: 'xlink:href' },
], function (pair) {

    var ngAttrName = pair.ngAttrName;
    var attrName = pair.attrName;

    angular.module('grademanagerApp').directive(ngAttrName, ['IeHelperSrv', function (IeHelperSrv) {
        return {
            priority: 99,
            link: function (scope, element, attrs) {
                attrs.$observe(ngAttrName, function (value) {
                    if (!value) {
                        return;
                    }
                    attrs.$set(attrName, value);
                    if (IeHelperSrv.isIE) {
                        element.prop(attrName, value);
                    }
                });
            }
        };
    }]);
});

var checkForIE = {
    init: function () {
        this.isIE = (navigator.userAgent.indexOf('MSIE') !== -1);
    }
};

angular.module('IeHelper', []).factory('IeHelperSrv', function () {

    return {
        isIE: checkForIE.isIE,
    };
});

checkForIE.init();