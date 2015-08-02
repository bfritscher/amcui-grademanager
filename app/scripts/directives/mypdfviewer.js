'use strict';

/**
 * @ngdoc directive
 * @name grademanagerApp.directive:myPdfViewer
 * @description
 * # myPdfViewer
 */
angular.module('grademanagerApp')
  .directive('myPdfViewer', function () {
    return {
      template: '<div class="pdfViewer"></div>',
      restrict: 'E',
      scope:{
        src: '@pdf'
      },
      link: function postLink(scope, element) {
          PDFJS.disableStream = true;
          var container = element[0];
          var pdfViewer = new PDFJS.PDFViewer({
            container: container
          });

          container.addEventListener('pagesinit', function () {
            // we can use pdfViewer now, e.g. let's change default scale.

          });

          scope.$watch('src', function(newValue){
              // Loading document.
              if(newValue){
                  PDFJS.getDocument(newValue).then(function (pdfDocument) {
                      // Document loaded, specifying document for the viewer.
                      pdfViewer.setDocument(pdfDocument);
                  });
              }
          });
      }
    };
  });
