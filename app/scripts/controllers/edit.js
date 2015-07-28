'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:EditorCtrl
 * @description
 * # EditorCtrl
 * Controller of the grademanagerApp
 */
 var test;
angular.module('grademanagerApp')
  .controller('EditCtrl', function ($scope, $http, $mdSidenav, $stateParams, $sce, $timeout, API, auth) {
	var editor = this;

	editor.leftNav = function (){
		return $mdSidenav('left');
	};

	/* Socket collab data */

	var DiffSyncClient = diffsync.Client;
	var socket = io.connect('http://192.168.59.103:9001?token='+ localStorage.getItem('jwtToken'));
	var client = new DiffSyncClient(socket, $stateParams.project);

	client.on('connected', function(){
	    // the initial data has been loaded,
	    // you can initialize your application
		console.log('Socket connected');
		editor.exam = client.getData();
		if(editor.exam.sections && editor.exam.sections.length > 0){
			editor.section = editor.exam.sections[0];
		} else {
			editor.section = newSection();
			editor.exam.sections = [editor.section];
		}

		$scope.$watch('editor.exam', function(){
			computeHierarchyNumbers();
			console.log('sync');
			client.sync();
		}, true);
		$scope.$apply();
/*
		$http.get('data/exam_test.json')
		.success(function(data){
			angular.extend(editor.exam, data);
			$scope.$apply();
			client.sync();
		});
*/
	});

	client.on('synced', function(){
    // an update from the server has been applied
    // you can perform the updates in your application now
    	console.log('synced');
    	$scope.$apply();
  	});

	client.on('error', function(err){
    // an update from the server has been applied
    // you can perform the updates in your application now
    	console.log('error', err);
  	});

	client.initialize();

	/*
      socket.on('msg', function(data){
          console.log('msg', data);
      });

      socket.on('unauthorized', function(data){
        console.log(data);
      });
      socket.on("error", function(error) {
        console.log(error);
        if (error.type === "UnauthorizedError" || error.code === "invalid_token") {
          // redirect user to login page perhaps?
          console.log("User's token has expired");
        }
      });
	*/
	editor.previousSection = function(){
		if(editor.exam && editor.exam.sections){
			var index = editor.exam.sections.indexOf(editor.section);
			if(index > 0){
				return editor.exam.sections[index-1];
			}
		}
	};

/* TODO add ids */
	function newSection(){
		return {
			title: 'Add Section',
			content: '',
			level: 0,
			isNumbered: true,
			isSectionTitleVisibleOnAMC: true,
			shuffle: false,
			columns: 1,
			questions: []
		};
	}

	editor.nextSection = function(create){
		if(editor.exam && editor.exam.sections){
			var index = editor.exam.sections.indexOf(editor.section);
			if(index < editor.exam.sections.length-1){
				return editor.exam.sections[index+1];
			} else {
				var section = newSection();
				if (create){
					$timeout(function(){
						editor.exam.sections.push(section);
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
		editor.exam.sections.splice(editor.exam.sections.indexOf(section), 1);
		editor.section = newSection;
	};

	editor.addQuestion = function(section){
		section.questions.push({
			content: '',
			type: 'SINGLE',
			layout: 'VERTICAL',
			answers: []
		});
	};

	editor.removeQuestion = function(section, question){
		section.questions.splice(section.questions.indexOf(question), 1);
	};

	editor.addAnswer = function(question){
		question.answers.push({
			content: 'answer text',
			correct: false
		});
	};

	editor.removeAnswer = function(question, answer){
		question.answers.splice(question.answers.indexOf(answer), 1);
	};

	//TODO: automate
	this.preview = function(){
		$http.post(API.URL + '/project/' + $stateParams.project + '/preview')
		.success(function(data){
			editor.preview = data;
		});
	};

	this.print = function(){
		//TODO: ask for speparate answer sheet
		$http.post(API.URL + '/project/' + $stateParams.project + '/print')
		.success(function(){
			//printed files ready!
			//API.URL + '/project/' + $stateParams.project + '/zip?token=' + auth.getToken();
			console.log('print files ready');
		});

	};

	this.pageSrc = function(page){
    	return $sce.trustAsResourceUrl(API.URL + '/project/' + $stateParams.project + '/out/' + page + '?token=' + auth.getToken());
    };

	this.examMenuOptions = {
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


	function computeHierarchyNumbers(){
		var questionCount = 1;
		var sections = [0, 0, 0];
		for(var s=0; s < editor.exam.sections.length; s++ ) {
			var section = editor.exam.sections[s];
			if(section.isNumbered){
				var label = '';
				for(var i = 0; i < 3; i++){
					if(parseInt(section.level) === i){
						sections[i]++;
					}
					if( i > 0){
						label += '.';
					}
					label += sections[i];
					if(parseInt(section.level) === i){
						//reset numbering below
						for(var j=i+1; j < 3; j++){
							sections[j] = 0;
						}
						section.number = label;
						break;
					}
				}
			} else {
				section.number = '';
			}
			for(var q=0; q < section.questions.length; q++){
				var question = section.questions[q];
				question.number = questionCount;
				questionCount++;
				//validate question
				question.isValid =  question.type === "SINGLE" ? question.answers.reduce(function(a, b){
						return a + b.correct;
					}, 0) === 1 : true;
			}
		}
	}

	test = {
		computeHierarchyNumbers: computeHierarchyNumbers
	};


  });

/*
		out += "\\newcommand{\\ACMUImatiere}{" + html2Latex(this.matiere, exam) + "}\n";
		out += "\\newcommand{\\ACMUIsession}{" + html2Latex(this.session, exam) + "}\n";
		out += "\\newcommand{\\ACMUIteacher}{" + html2Latex(this.teacher, exam) + "}\n\n";
this.toLatexBody = function(exam){
        var out = "";
		if(this.sectionContent != ""){
			out += "\n\\";
			if(this.sectionIsAmc) out += 'AMC';
			out += this.sectionLevel;
			if(!this.sectionNumbered) out += '*';
			out += "{" +  html2Latex(this.sectionContent, exam) +"}\n\n";
		}

		out += html2Latex(this.content, exam) + "\n";

        if(this.shuffle) out+="\melangegroupe{" + this.id + "}\n";
		if(this.columns > 1) out+= "\\begin{multicols}{" + this.columns + "}\n";
        out += "\\restituegroupe{" + this.id + "}\n";
		if(this.columns > 1) out+= "\\end{multicols}\n";
		return out;
    };

	this.toLatexHead = function(groupId, exam){
		var out = "\n";
		out += "\\element{" + groupId + "}{\n";
		var type = this.type == app.Question.prototype.SINGLE ? "question" : "questionmult";
		out += "  \\begin{" + type + "}{Q" + (exam.questionCounter++) + "}\n";
		out += "  \n" +  html2Latex(this.content, exam) + "\n";
		var layout = this.layout == app.Question.prototype.VERTICAL ? "reponses" : "reponseshoriz";
		out += "    \\begin{" + layout + "}\n"
		this.answers.asArray().forEach(function(answer){
			out += answer.toLatexHead(exam);
		});
		out += "    \\end{" + layout + "}\n";
		out += "  \\end{" + type + "}\n";
		out += "}\n";

function Code(){
	this.toLatex = function(){
		var mode = app.Code.prototype.modeToLanguage[this.mode];
		var out = "\\lstinputlisting[";
		if(this.border) out+="frame=single,";
		if(!this.numbers) out+="numbers=none,";
		out += "language=" + mode + "]{src/" + this.id + "}";
		return out;
	};

function Graphics(){
	this.toLatex = function(){
		var out = "\\includegraphics[" + this.options  + "]{src/" + this.id + "}";
		if(this.border){
			out = "\\fbox{" + out + "}";
		}
    this.options = 'width=0.7\\textwidth';
*/

