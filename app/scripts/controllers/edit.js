'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:EditorCtrl
 * @description
 * # EditorCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('EditCtrl', function ($scope, $http, $mdSidenav, $mdDialog, $location, $stateParams, $sce, $timeout, API, auth, exam) {
	var editor = this;
	editor.examService = exam;

	//TODO automate
	API.loadProject($stateParams.project);


	 $scope.$watch(function(){
		 return $location.search().section;
		 }, function(newIndex) {
		if(editor.examService.exam && editor.examService.exam.sections) {
			var index = editor.examService.exam.sections.indexOf(editor.section);
			if(index > -1 && newIndex > -1 && newIndex !== index){
				editor.section =  editor.examService.exam.sections[newIndex];
			}
		}
	  });

	  $scope.$watch('editor.section', function(section){
		  if(editor.examService.exam && editor.examService.exam.sections) {
			  var index = editor.examService.exam.sections.indexOf(section);
			  if(index > -1 && $location.search().section !== index){
				  $location.search({section: index});
			  }
		  }
	  });

	/* Socket collab data */
	exam.load(function(client){
		if (editor.examService.exam && editor.examService.exam.sections && editor.examService.exam.sections.length > 0){
             editor.section = editor.examService.exam.sections[$location.search().section || 0];
        } else {
		     if(!editor.exam) {
                  editor.examService.exam = {};
             }
             editor.section = editor.examService.newSection();
             editor.examService.exam.sections = [editor.section];
        }
	    $scope.$watch('editor.examService.exam', function(){
	        editor.examService.computeHierarchyNumbers();
	        console.log('sync');
	        client.sync();
			//request preview debounce
			/*
			v
		*/
	    }, true);
		$scope.$on("$destroy", function() {
			client.removeAllListeners();
		});
	});

	editor.leftNav = function (){
		return $mdSidenav('left');
	};

	editor.rightNav = function (){
		return $mdSidenav('right');
	};

	editor.previousSection = function(){
		if(editor.examService.exam && editor.examService.exam.sections){
			var index = editor.examService.exam.sections.indexOf(editor.section);
			if(index > 0){
				return editor.examService.exam.sections[index-1];
			}
		}
	};

	editor.nextSection = function(create){
		if(editor.examService.exam && editor.examService.exam.sections){
			var index = editor.examService.exam.sections.indexOf(editor.section);
			if(index < editor.examService.exam.sections.length-1){
				return editor.examService.exam.sections[index+1];
			} else {
				var section = editor.examService.newSection();
				if (create){
					$timeout(function(){
						editor.examService.exam.sections.push(section);
					});
				}
				return section;
			}
		}
	};

	editor.removeSection = function(section){
		var newSection = editor.previousSection();
		if(!newSection) {
			newSection = editor.nextSection(true);
		}
		editor.examService.exam.sections.splice(editor.examService.exam.sections.indexOf(section), 1);
		editor.section = newSection;
	};

	editor.latexSourceOptions = {
		mode: 'stex',
		lineNumbers: true,
		lineWrapping: true,
		viewportMargin: Infinity,
		readOnly: false
	};

	editor.latexPreviewOptions = {
		mode: 'stex',
		lineNumbers: true,
		lineWrapping: true,
		viewportMargin: Infinity,
		readOnly: true
	};

	editor.showPreviewDialog = function($event){
		/*
		var data = exam.toLatex();
		data.source = exam.exam.source;
		$http.post(API.URL + '/project/' + $stateParams.project + '/preview', data)
		.success(function(data){
			editor.preview = data;
		});*/

		$mdDialog.show({
	        clickOutsideToClose: true,
	        templateUrl: 'views/edit.preview.html',
	        targetEvent: $event,
	        controller: 'EditPreviewCtrl',
	        controllerAs: 'ctrl'
	      });
	};

	editor.examMenuOptions = {
		accept: function(sourceNode, destNodes) {
        var data = sourceNode.$modelValue;
		var srcType;
		if(data.hasOwnProperty('questions')){
			srcType = 'section';
		}else{
			srcType = 'question';
		}
        var destType = destNodes.$element.attr('data-type');
        return (srcType === destType);
      },
	  dropped: function(event) {
        console.log(event);
        /*
        var sourceNode = event.source.nodeScope;
        var destNodes = event.dest.nodesScope;
        // update changes to server

		if (destNodes.isParent(sourceNode)
          && destNodes.$element.attr('data-type') == 'category') { // If it moves in the same group, then only update group
          var group = destNodes.$nodeScope.$modelValue;
          group.save();
        } else { // save all
          $scope.saveGroups();
        }
		*/
      }
	};
  });


