'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:EditorCtrl
 * @description
 * # EditorCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('EditCtrl', function ($http) {
	var editor = this;
    $http.get('data/exam_test.json')
	.success(function(data){
		editor.exam = data;
	});

	this.examMenuOptions = {
		accept: function(sourceNode, destNodes, destIndex) {
        var data = sourceNode.$modelValue;
		var srcType = undefined;
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

	this.getConsecutiveIndex = function(parentIndex, $index) {
	    var total = 0;
	    for(var i = 0; i < parentIndex; i += 1) {
	      total += editor.exam.sections[i].questions.length;
	    }
	    return total + $index + 1;
	  };

	this.removeSection = function(section){
		editor.exam.sections.splice(editor.exam.sections.indexOf(section), 1);
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

