'use strict';

/**
 * @ngdoc directive
 * @name grademanagerApp.directive:myRichTextEditor
 * @description
 * # myRichTextEditor
 */

/* jshint ignore:start */
function GUID(){
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}
/* jshint ignore:end */

 //patch wysihtml5 with additional commands
(function(wysihtml5) {
  wysihtml5.commands.latex = {
    exec: function(composer, command) {
      return wysihtml5.commands.formatInline.exec(composer, command, "xmp");
    },

    state: function(composer, command) {
      return wysihtml5.commands.formatInline.state(composer, command, "xmp");
    }
  };
  wysihtml5.commands.ttfont = {
    exec: function(composer, command) {
      return wysihtml5.commands.formatInline.exec(composer, command, "pre");
    },

    state: function(composer, command) {
      return wysihtml5.commands.formatInline.state(composer, command, "pre");
    }
  };
	wysihtml5.commands.insertCode = {
	  exec: function(composer, command, html) {
  		html = '<code id="code'+ GUID() +'".*?>code</code>';
  		command = 'insertHTML';
  		if (composer.commands.support(command)) {
  		  composer.doc.execCommand(command, false, html);
  		} else {
  		  composer.selection.insertHTML(html);
  		}
	  },
    state: function() {
  		return false;
	  }
	};
})(wysihtml5);

angular.module('grademanagerApp')
  .directive('myRichTextEditor', function ($timeout, $mdDialog, exam) {

      var myParse = function(elementOrHtml_current, config){
        // replace empty tags
        elementOrHtml_current = elementOrHtml_current.replace(/<b><\/b>/, '');
        elementOrHtml_current = elementOrHtml_current.replace(/<i><\/i>/, '');
        elementOrHtml_current = elementOrHtml_current.replace(/<pre><\/pre>/, '');
        elementOrHtml_current = elementOrHtml_current.replace(/<xmp><\/xmp>/, '');
        return wysihtml5.dom.parse(elementOrHtml_current, config);
      };

     return {
      restrict: 'E',
      replace: true,
      require: '?ngModel',
      transclude: true,
      templateUrl: 'views/myrichtexteditor.html',
      scope:{
        'content': '=ngModel',
        'allGraphics': '=graphics'
      },
      link: function (scope, element, attrs, ngModel) {
        var toolbar = element.children()[0];
        var textarea = element.children()[1];
        var preview = element.children()[2];
        var graphicsToolbar = element.children()[3];

        var editor;

        function decorate(){
            console.log('decorate');
            var element = preview;
            if(editor){
              element= editor.composer.editableArea;
            }
            var imgs = element.getElementsByTagName('img');
            for(var i=0; i < imgs.length; i++){
                var imgElement= imgs[i];
                var img = exam.getGraphics(imgElement.getAttribute('id'));
                if (img) {
                    imgElement.setAttribute('src', exam.graphicsPreviewURL(img.id));
                    imgElement.classList.toggle('border', img.border);
                    imgElement.style.width = img.width * 100 + '%';
                } else {
                  imgElement.setAttribute('src', exam.graphicsPreviewURL(''));
                }
            }
        }

        scope.showGraphicsManager = function($event){
            $mdDialog.show({
                clickOutsideToClose: true,
                templateUrl: 'views/graphicsmanager.html',
                targetEvent: $event,
                controller: 'GraphicsManagerCtrl',
                controllerAs: 'ctrl'
            })
            .then(function(id){
                wysihtml5.commands.insertImage.exec(editor.composer, 'insertImage', {id: id});
                $timeout(decorate);
            });
        };

        function initEditor(){
            editor = new wysihtml5.Editor(textarea, {
                autoLink: false,
                toolbar: toolbar,
                parserRules: wysihtml5ParserRules,
                parser: myParse,
                contentEditableMode: true,
                useLineBreaks: false,
                stylesheets: ['styles/wysihtml5_custom.css']
            });

            scope.closeGraphicsToolbar = function(){
              graphicsToolbar.classList.add('hide');
            };

            $timeout(function(){
                editor.composer.editableArea.addEventListener('click', function(event){
                    if (event.target.tagName === 'IMG'){
                        var imgElement = event.target;
                        graphicsToolbar.classList.remove('hide');
                        graphicsToolbar.style.top = imgElement.offsetTop + 'px';
                        graphicsToolbar.style.left = imgElement.offsetLeft + 'px';
                        graphicsToolbar.style.width = imgElement.offsetWidth + 'px';
                        scope.graphics = exam.getGraphics(imgElement.getAttribute('id'));
                        scope.$apply();
                    }
                });
            });

            editor.on('focus', function() {
                toolbar.classList.remove('hide');
            });

            editor.on('blur', function() {
                toolbar.classList.add('hide');
                graphicsToolbar.classList.add('hide');
            });

            // Sync view -> model
            editor.on('change', function(){
              scope.$apply(function(){
                  console.log('change');
                  ngModel.$setViewValue(editor.getValue(true));
              });
            });

            editor.on('paste', function(){
                $timeout(decorate);
            });

            editor.on('aftercommand:composer', function(){
                $timeout(decorate);
            });

            editor.on('change_view', function(){
                $timeout(decorate);
            });

            toolbar.classList.remove('hide');
            textarea.classList.remove('hide');

            //remove preview since we now have the editor
            element[0].removeChild(preview);
            preview = null;
            editor.setValue(ngModel.$viewValue || '');
            $timeout(function(){
              editor.focus();
            });
        }

        scope.$watch('allGraphics', function(oldValue, newValue){
          console.log(oldValue, newValue, scope.allGraphics, scope.graphics);
          //TODO only update if changed.
          //TODO only watch graphics which we own.
          $timeout(decorate);
        }, true);

        // Sync model -> view
        ngModel.$render = function () {
            var newValue = ngModel.$viewValue || '';
            console.log('content change');
             if (preview) {
               console.log('preview');
               preview.innerHTML = newValue;
             }
             if (editor) {
                editor.setValue(newValue);
             }
             $timeout(decorate);
        };



        //only initEditor if needed
        preview.addEventListener('click', initEditor, false);

      }
    };
  });
