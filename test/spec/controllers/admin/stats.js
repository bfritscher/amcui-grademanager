'use strict';

describe('Controller: AdminStatsCtrl', function () {

  // load the controller's module
  beforeEach(module('grademanagerApp'));

  var AdminStatsCtrl,
    scope;

  // Initialize the controller and a mock scope
  beforeEach(inject(function ($controller, $rootScope) {
    scope = $rootScope.$new();
    AdminStatsCtrl = $controller('AdminStatsCtrl', {
      $scope: scope
      // place here mocked dependencies
    });
  }));

  it('should attach a list of awesomeThings to the scope', function () {
    expect(AdminStatsCtrl.awesomeThings.length).toBe(3);
  });
});
