'use strict';

/**
 * @ngdoc service
 * @name grademanagerApp.exam
 * @description
 * # exam
 * Service in the grademanagerApp.
 */
angular.module('grademanagerApp')
  .service('exam', function ($rootScope, API, auth) {
    var editor = this;
    var DiffSyncClient = diffsync.Client;

    editor.preview = function(){
        var data = editor.toLatex();
		data.source = editor.exam.source;
        API.preview(data);
    };

    editor.print = function(){
        //TODO: ask for speparate answer sheet??
        var data = editor.toLatex();
		data.source = editor.exam.source;
        API.print(data);
	};

    editor.load = function(callback) {
        var client = new DiffSyncClient(API.socket, API.project);
        client.on('connected', function(){
            // the initial data has been loaded,
            // you can initialize your application
            console.log('Socket connected');
            editor.exam = client.getData();
            callback(client);
            $rootScope.$apply();
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
            $rootScope.$apply();
         });

        client.on('error', function(err){
            // an update from the server has been applied
            // you can perform the updates in your application now
            console.log('error', err);
        });

        client.initialize();
    };

    editor.newSection = function newSection() {
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
    };

    editor.addQuestion = function(section){
        var question = {
            id: 'q' + GUID(),
            content: '<p></p>',
            type: 'SINGLE',
            layout: 'VERTICAL',
            answers: []
        };
        section.questions.push(question);
        return question;
    };

    editor.copyQuestion = function(section, question){
        var copy = editor.addQuestion(section);
        copy.content = question.content;
        copy.type = question.type;
        copy.layout = question.layout;
        question.answers.forEach(function(answer){
            editor.copyAnswer(copy, answer);
        });
        return copy;
    };

    editor.removeQuestion = function(section, question){
        section.questions.splice(section.questions.indexOf(question), 1);
    };

    editor.addAnswer = function(question){
        var answer = {
            id: 'a' + GUID(),
            content: '<p></p>',
            correct: false
        };
        question.answers.push(answer);
        return answer;
    };

    editor.copyAnswer = function(question, answer){
        var copy = editor.addAnswer(question);
        copy.content = answer.content;
        copy.correct = answer.correct;
        return copy;
    };

    editor.removeAnswer = function(question, answer){
        question.answers.splice(question.answers.indexOf(answer), 1);
    };

    editor.createGraphics = function(){
        return {
            id: 'g' + GUID(),
            border: false,
            width: 0.7,
            name: ''
        };
    };

    editor.addGraphics = function(graphics){
        if(!editor.exam.graphics){
            editor.exam.graphics = {};
        }
        editor.exam.graphics[graphics.id] = graphics;
    };

    editor.deleteGraphics = function(graphics){
        delete editor.exam.graphics[graphics.id];
        //TODO: delete on server
    };

    editor.computeHierarchyNumbers= function computeHierarchyNumbers(){
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
    };

    editor.graphicsPreviewURL = function(id) {
        return API.PROJECT_URL + '/static/src/graphics/' + id + '_thumb.jpg?token='+ auth.getToken();
    };

    editor.getJSON = function(){
        return JSON.stringify(angular.copy(editor.exam), null, 2);
    };

    editor.getGraphics = function (id) {
        if(editor.exam && editor.exam.graphics && editor.exam.graphics.hasOwnProperty(id)){
            return editor.exam.graphics[id];
        }
    };

    editor.getGraphicsByName = function (name) {
        if(editor.exam && editor.exam.graphics){
            for(var key in editor.exam.graphics){
                if(editor.exam.graphics[key].name === name){
                    return editor.exam.graphics[key];
                }
            }
        }
    };

    // Latex convert code

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
        var img = editor.getGraphics(node.getAttribute('id'));
        if(img){

            var options = 'width=' + img.width + '\\textwidth';
            var out = "\\includegraphics[" + options  + "]{src/graphics/" + img.id + "}";
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

                        case 'UL':
                            out += '\\begin{itemize}\n' + handleNode(child) + '\\end{itemize}\n';
                            break;

                        case 'LI':
                            out += '\\item ' + handleNode(child) + '\n';
                            break;

                        case 'BOX':
                            out += '\\fbox{\\parbox{\\textwidth}{\n' + handleNode(child) + '}}\\newline\n';
                            break;

                        case 'HR':
                            out += '\\newpage\n';
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
                body.push('\\melangegroupe{' + section.id + '}');
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
