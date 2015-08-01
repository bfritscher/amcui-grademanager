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
  .directive('myRichTextEditor', function ($timeout, $stateParams, API, auth) {
      
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
        'content': '=ngModel'
      },
      link: function (scope, element, attrs, ngModel) {
        var toolbar = element.children()[0];
        var textarea = element.children()[1];
        var preview = element.children()[2];

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
              var id = imgElement.getAttribute('id');
              if (id) {
                imgElement.setAttribute('src', API.URL  + '/project/' + $stateParams.project + '/debug/src/graphics/' + id + '_thumb.jpg?token='+ auth.getToken());
              }
            }
          }

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

            editor.on('focus', function() {
                toolbar.classList.remove('hide');
            });

            editor.on('blur', function() {
                toolbar.classList.add('hide');
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
