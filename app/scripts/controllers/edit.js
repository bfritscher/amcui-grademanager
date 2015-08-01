'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:EditorCtrl
 * @description
 * # EditorCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('EditCtrl', function ($scope, $http, $mdSidenav, $stateParams, $sce, $timeout, API, auth) {
	var editor = this;

	editor.leftNav = function (){
		return $mdSidenav('left');
	};

	/* Socket collab data */

	var DiffSyncClient = diffsync.Client;
	var socket = io.connect(API.URL + '?token='+ localStorage.getItem('jwtToken'));
	var client = new DiffSyncClient(socket, $stateParams.project);

	client.on('connected', function(){
	    // the initial data has been loaded,
	    // you can initialize your application
		console.log('Socket connected');
		editor.exam = client.getData();
		if(editor.exam && editor.exam.sections && editor.exam.sections.length > 0){
			editor.section = editor.exam.sections[0];
		} else {
			if(!editor.exam) {
				editor.exam = {};
			}
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
			id: 's' + GUID(),
			title: 'Add Section',
			content: '<p></p>',
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
			id: 'q' + GUID(),
			content: '<p></p>',
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
			id: 'a' + GUID(),
			content: '<p>answer text</p>',
			correct: false
		});
	};

	editor.removeAnswer = function(question, answer){
		question.answers.splice(question.answers.indexOf(answer), 1);
	};

	//TODO: automate
	this.preview = function(){
		$http.post(API.URL + '/project/' + $stateParams.project + '/preview', editor.toLatex())
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


function escapeLatex(text){
	text = text.replace(/&nbsp;/g, ' ');
	// escape latex code
    var escapeChars = {
        "&lt;":"<",
        "&gt;":">",
        "\\\\": "\\textbackslash",
        "&": "\\&",
        "%": "\\%",
        "\\$": "\\$",
        "\\#": "\\#",
        "_": "\\_",
        "\\{": "\\{",
        "\\}": "\\}",
        "~": "\\textasciitilde",
        "\\^": "\\textasciicircum"
    };
	for(var char in escapeChars){
        var regex = new RegExp(char,"g");
        text = text.replace(regex, escapeChars[char]);
    }

	return text;
}

/* TODO handle code and img and their options */
function codeNode2Latex(node){
	console.log(node);
	return 'CODE\\_NOT\\_FOUND';
	/*
	var mode = app.Code.prototype.modeToLanguage[this.mode];
		var out = "\\lstinputlisting[";
		if(this.border) out+="frame=single,";
		if(!this.numbers) out+="numbers=none,";
		out += "language=" + mode + "]{src/" + this.id + "}";
		return out;
	*/
}

function imgNode2Latex(node){
	var id = node.getAttribute('id');
	if(id && editor.exam.graphics && editor.exam.graphics.hasOwnProperty(id)){
		var img = editor.exam.graphics[id];
		var options = 'width=0.7\\textwidth';
		var out = "\\includegraphics[" + options  + "]{src/graphics/" + id + "}";
		if(img.border){
			out = "\\fbox{" + out + "}";
		}
		return out;
	}
	
	return 'IMG\\_NOT\\_FOUND';
}

function html2Latex(content){
	var div = document.createElement('div');
	div.innerHTML = content;
	function handleNode(node){
		if (node.hasChildNodes()) {
			var childs = node.childNodes;
			var out = '';
			for(var i=0; i < childs.length; i++){
				var child = childs[i];
				switch (child.nodeName) {
					case '#text':
						out += escapeLatex(child.textContent);
						break;

					case 'XMP':
						out += ' ' + child.textContent + ' '; //check if too much is left out of textContent
						break;

					case 'B':
						out += '\\textbf{' + handleNode(child) + '}';
						break;

					case 'I':
						out += '\\emph{' + handleNode(child) + '}';
						break;

					case 'PRE':
						out += '\\texttt{' + handleNode(child) + '}';
						break;

					case 'IMG':
						out += imgNode2Latex(child);
						break;

					case 'CODE':
						out += codeNode2Latex(child);
						break;

					case 'P':
						out += handleNode(child) + '\n\n';
						break;

					default:
						break;
				}
			}
			return out;
		} else {
			return node.textContent;
		}
	}
	return handleNode(div);
}

/* TODO handle points */

function answerToLatex(answer, head){
	head.push('      \\' + (answer.correct ? 'bonne' : 'mauvaise') + '{' + html2Latex(answer.content) + '}');
}

function choiceQuestionToLatex(question, type, head){
	var layout = question.layout === 'VERTICAL' ? 'reponses' : 'reponseshoriz';
	head.push('  \\begin{' + type + '}{Q' + ('00' + question.number).slice(-2) + '}');
    head.push('\n  ' + html2Latex(question.content));
	head.push('\n    \\begin{' + layout + '}');
    question.answers.forEach(function(answer){
		answerToLatex(answer, head);
    });
    head.push('    \\end{' + layout + '}');
   	head.push('  \\end{' + type + '}');
}

function questionToLatex(section, question, head){
	head.push('\\element{' + section.id + '}{');
	switch (question.type) {
		case 'SINGLE':
			choiceQuestionToLatex(question, 'question', head);
			break;

		case 'MULTIPLE':
			choiceQuestionToLatex(question, 'questionmult', head);
			break;

		/* TODO handle other types */
	}
	head.push('}');
}

function sectionToLatex(section, head, body){
	//head make questions
	section.questions.forEach(function(question){
		questionToLatex(section, question, head);
	});

	//body  build title
	if(section.title !== ''){
		var title = '\n\\';
		if (section.isSectionTitleVisibleOnAMC) {
			title += 'AMC';
		}
		title += new Array(parseInt(section.level) + 1).join('sub') + 'section';
        if (!section.isNumbered) {
			title += '*';
		}
		title += '{' +  html2Latex(section.title) + '}\n';
		body.push(title);
	}

	body.push(html2Latex(section.content));

	if(section.questions.length > 0){
		if (section.shuffle) {
			body.push('\melangegroupe{' + section.id + '}');
		}
		var wrap = function(callback){
			callback();
		};
		if (section.columns > 1) {
			wrap = function(callback){
				body.push('\\begin{multicols}{' + section.columns + '}');
				callback();
				body.push('\\end{multicols})');
			};
		}
	    wrap(function(){
			body.push('\\restituegroupe{' + section.id + '}');
		});
	}
}

	editor.toLatex = function(){
		var head = [];
		var body = [];
		if(editor.exam && editor.exam.sections){
			head.push('\\newcommand{\\ACMUImatiere}{' + html2Latex(editor.exam.course || '') + '}');
        	head.push('\\newcommand{\\ACMUIsession}{' + html2Latex(editor.exam.session || '') + '}');
        	head.push('\\newcommand{\\ACMUIteacher}{' + html2Latex(editor.exam.teacher || '') + '}\n');

			editor.exam.sections.forEach(function(section){
				sectionToLatex(section, head, body);
			});
		}

		return {
			questions_definition: head.join('\n'),
			questions_layout: body.join('\n')
		};
	};

  });


