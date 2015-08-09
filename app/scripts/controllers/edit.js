'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:EditorCtrl
 * @description
 * # EditorCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('EditCtrl', function ($scope, $mdSidenav, $mdDialog, $mdToast, $location, $state, $stateParams, $timeout, API, exam) {
	var editor = this;
	editor.examService = exam;
	editor.API = API;

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


	editor.lastPreview = 0;
	editor.waitTime = 5 * 1000;
	editor.previewWait = false;

	editor.linkToQuestion = function(section, question){
		return '#/' + $stateParams.project + '/edit?section=' + exam.exam.sections.indexOf(section) + '#q' + (question ? question.number : '0');
	};

	var debounceTimer;

	function throttleDebouncePreview(){
		if(debounceTimer){
			$timeout.cancel(debounceTimer);
		}
		if(new Date().getTime() - editor.lastPreview > editor.waitTime){
			editor.previewWait = false;
			exam.preview();
			editor.lastPreview = new Date().getTime();
		} else {
			editor.previewWait = true;
			debounceTimer = $timeout(throttleDebouncePreview, editor.waitTime);
		}
	}

	/* Socket collab data */
	exam.load(function(client){
	    $scope.$watch('editor.examService.exam', function(){
	        editor.examService.computeHierarchyNumbers();
	        client.sync();
			//request preview throttle
			throttleDebouncePreview();

	    }, true);
		$scope.$on("$destroy", function() {
			client.removeAllListeners();
		});
		if (editor.examService.exam && editor.examService.exam.sections && editor.examService.exam.sections.length > 0){
             editor.section = editor.examService.exam.sections[$location.search().section || 0];
        } else {
             editor.section = editor.examService.newSection();
             editor.examService.exam.sections = [editor.section];
        }
		//handleCopy
		handleCopy();
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

	editor.range = function(n){
		return new Array(parseInt(n));
	};

	editor.latexSourceOptions = {
		mode: 'stex',
		lineNumbers: true,
		lineWrapping: true,
		viewportMargin: Infinity,
		readOnly: false,
		matchBrackets: true,
		autoCloseBrackets: true
	};

	editor.latexPreviewOptions = {
		mode: 'stex',
		lineNumbers: true,
		lineWrapping: true,
		viewportMargin: Infinity,
		readOnly: 'nocursor',
		matchBrackets: true
	};

	editor.jsonPreviewOptions = {
		mode: 'application/json',
		lineNumbers: true,
		lineWrapping: true,
		viewportMargin: Infinity,
		readOnly: 'nocursor',
		matchBrackets: true
	};

	editor.questionIsNoneCorrect = function(question){
		return question.answers.every(function(a){
			return !a.correct;
		});
	};

	editor.showPreviewDialog = function($event){

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
      }
	  /*,
	  dropped: function(event) {

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

      }*/
	};

	editor.copy = {

	};

	editor.copyCheckbox = {

	};

	function findQuestionCopy(questions, id){
		for(var i=0; i < questions.length; i++){
			if(questions[i].id === id){
				return questions[i];
			}
		}
	}

	editor.copySummary = function(){
		var sectionsCount = Object.keys(editor.copy).length;
		return {
			sections: sectionsCount,
			questions: Object.keys(editor.copyCheckbox).length - sectionsCount,
		};
	};

	editor.toggleCopy = function(section, question) {
		var sectionCopy, questionCopy;
		if(editor.copy.hasOwnProperty(section.id)){
			sectionCopy = editor.copy[section.id];
			if(question){
				//question handle
				questionCopy = findQuestionCopy(sectionCopy.questions, question.id);
				if(questionCopy){
					//remove
					sectionCopy.questions.splice(sectionCopy.questions.indexOf(questionCopy), 1);
					editor.copyCheckbox[question.id] = false;
				} else {
					//add
					sectionCopy.questions.splice(section.questions.indexOf(question), 0, angular.copy(question));
					editor.copyCheckbox[question.id] = true;
				}

			} else {
				//remove section

				sectionCopy.questions.forEach(function(q){
					editor.copyCheckbox[q.id] = false;
				});
				editor.copyCheckbox[section.id] = false;
				delete editor.copy[section.id];
			}
		} else {
			//add section copy
			sectionCopy = angular.copy(section);
			editor.copy[section.id] = sectionCopy;
			editor.copyCheckbox[sectionCopy.id] = true;
			//add question
			if(question){
				sectionCopy.questions = [];
				sectionCopy.questions.splice(section.questions.indexOf(question), 0, angular.copy(question));
				editor.copyCheckbox[question.id] = true;
			} else {
				//add all
				sectionCopy.questions.forEach(function(q){
					editor.copyCheckbox[q.id] = true;
				});
			}
		}
	};

	editor.copyTo = function(){
		var name = editor.copyToName;
		var copy = {
			src: $stateParams.project,
			dest: name,
			sections: editor.copy,
			graphics: {},
			codes: {}
		};
		//TODO: filter code and graphics to be copied #54
		copy.graphics = angular.copy(exam.exam.graphics);
		copy.codes = angular.copy(exam.exam.codes);
		localStorage.setItem('copy', angular.toJson(copy));
		$state.go( 'edit', {project: name}, {reload: true});
	};

	function handleCopy(){
		var copy = localStorage.getItem('copy');
		if(copy) {
			copy = angular.fromJson(copy);
			if (copy.dest === $stateParams.project){
				for(var key in copy.sections){
					if(copy.sections.hasOwnProperty(key)){
						//handle duplicate id
						if(exam.getSection(copy.sections[key].id)){
							copy.sections[key].id = GUID();
						}
						exam.exam.sections.push(copy.sections[key]);
					}
				}
				if(!exam.exam.graphics){
					exam.exam.graphics = {};
				}
				if(!exam.exam.codes){
					exam.exam.codes = {};
				}
				angular.extend(exam.exam.graphics, copy.graphics);
				angular.extend(exam.exam.codes, copy.codes);
				API.copyGraphics(copy.src, copy.dest);
				$mdToast.show($mdToast.simple().content('Content has been copied!').position('top right'));
				localStorage.removeItem('copy');
			}
		}
	}
  });
