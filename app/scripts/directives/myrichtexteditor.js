'use strict';

/**
 * @ngdoc directive
 * @name grademanagerApp.directive:myRichTextEditor
 * @description
 * # myRichTextEditor
 */

 //patch wysihtml5 with additional commands
(function(wysihtml5) {
  var REG_EXP = /latex/g;
  wysihtml5.commands.latex = {
    exec: function(composer, command) {
      return wysihtml5.commands.formatInline.exec(composer, command, "span", "latex", REG_EXP);
    },

    state: function(composer, command) {
      return wysihtml5.commands.formatInline.state(composer, command, "span", "latex", REG_EXP);
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
  		html = '<span id="code'+ GUID() +'".*?></span>';
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
  .directive('myRichTextEditor', function () {
     return {
      restrict: 'E',
      replace: true,
      require: '?ngModel',
      transclude: true,
      scope: {
          content: '=ngModel'
      },
      templateUrl: 'views/myrichtexteditor.html',
      link: function (scope, element) {
        var toolbar = element.children()[0];
        var textarea = element.children()[1];
        var preview = element.children()[2];

        var editor;

        function initEditor(){
            editor = new wysihtml5.Editor(textarea, {
                autoLink: false,
                toolbar: toolbar,
                parserRules: wysihtml5ParserRules,
                parser: wysihtml5.dom.parse,
                contentEditableMode: true,
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
                  scope.content = editor.getValue(true);
              });
            });

            editor.on('paste', function(){
                //$timeout(decorate);
            });

            editor.on('aftercommand:composer', function(){
                //$timeout(decorate);
            });

            editor.on('change_view', function(){
                //$timeout(decorate);
            });

            //remove preview since we now have the editor
            element[0].removeChild(preview);
        }

        //only initEditor if needed
        preview.innerHTML = scope.content;
        preview.addEventListener('click', initEditor, false);

      }
    };
  });
