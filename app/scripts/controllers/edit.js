'use strict';

/**
 * @ngdoc function
 * @name grademanagerApp.controller:EditorCtrl
 * @description
 * # EditorCtrl
 * Controller of the grademanagerApp
 */
angular.module('grademanagerApp')
  .controller('EditCtrl', function () {
    this.exam = {
      course: '',
      session: '',
      teacher: '',
      //POINTS?
      sections: [
        {
          title: 'Section 1',
          content: '',
          level: 0, //section or sub* sections
          isNumbered: true, // * in LaTeX
          isSectionTitleVisibleOnAMC: true, // AMC before section in LaTeX
          shuffle: false,
          columns: 1,
          questions: [
            {
              content: '',
              type: '', // SINGLE, MULTIPLE, OPEN
              layout: '', //VERTICAL HORIZONTAL
              //POINTS?
              answers: [
                {
                  content:'',
                  correct: false
                  //POINTS?
                }
              ]
            }
          ]
        }
      ]
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

