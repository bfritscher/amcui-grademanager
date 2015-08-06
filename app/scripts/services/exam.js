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
        data.codes = editor.exam.codes;
        API.preview(data);
    };

    editor.print = function(){
        //TODO: ask for speparate answer sheet??
        var data = editor.toLatex();
		data.source = editor.exam.source;
        data.codes = editor.exam.codes;
        API.print(data);
	};

    editor.load = function(callback) {
        var client = new DiffSyncClient(API.socket, API.project);
        client.on('connected', function(){
            // the initial data has been loaded,
            // you can initialize your application
            editor.exam = client.getData();
            callback(client);
            $rootScope.$apply();
         });

         client.on('synced', function(){
             // an update from the server has been applied
             // you can perform the updates in your application now
            $rootScope.$apply();
         });

        client.on('error', function(err){
            // an update from the server has been applied
            // you can perform the updates in your application now
            console.log('error', err);
        });

        client.initialize();
    };

    editor.loadTemplate = function(name){
        API.loadTemplate(name)
        .success(function(source){
            if(editor.exam){
                editor.exam.source = source;
            }
        });
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

/*
Note supported
QuestionIndicative
\AMCBoxedAnswers

TODO: \bareme{auto=0,v=-1,e=-2}

*/
    editor.addQuestion = function(section){
        //copy type from previous question
        var previous;
        if(section.questions && section.questions.length > 0){
            previous = section.questions[section.questions.length - 1];
        }

        var question = {
            id: 'q' + GUID(),
            content: '<p></p>',
            type: 'SINGLE',
            layout: 'VERTICAL',
            ordered: false,
            scoring: '',
            points: 1,
            dots: false,
            lines: 3,
            answers: []
        };
        if(previous){
            question.type = previous.type;
        }
        if(question.type !== 'OPEN'){
            editor.addAnswer(question);
            editor.addAnswer(question);
        }

        section.questions.push(question);
        return question;
    };

    editor.copyQuestion = function(section, question){
        var copy = editor.addQuestion(section);
        copy.content = question.content;
        copy.type = question.type;
        copy.layout = question.layout;
        copy.ordered = question.ordered;
        copy.scoring = question.scoring;
        copy.points = question.points;
        copy.dots = question.dots;
        copy.lines = question.lines;

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
        API.deleteGraphics(graphics)
        .success(function(){
            delete editor.exam.graphics[graphics.id];
        });
    };

    editor.addCode = function(id){
        var code = {
            id: id,
            border: true,
            mode: '',
            numbers: false,
            content: ''
        };
        if(!editor.exam.codes){
            editor.exam.codes = {};
        }
        editor.exam.codes[code.id] = code;
        return code;
    };

    editor.getCode = function (id, create) {
        if(editor.exam && editor.exam.codes && editor.exam.codes.hasOwnProperty(id)){
            return editor.exam.codes[id];
        } else {
            if (create) {
                return editor.addCode(id);
            }
        }
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
                question.isValid =  (question.type === "OPEN" ? true : question.answers.length > 0) && (question.type === "SINGLE" ? question.answers.reduce(function(a, b){
                        return a + b.correct;
                    }, 0) === 1 : true);
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

    var modeToLanguage = {
        'text/html': 'html',
        'text/css': 'html',
        'text/javascript': 'JavaScript',
        'text/x-sql': 'SQL'
    };

    /* TODO handle code and img and their options */
    function codeNode2Latex(node){
        var code = editor.getCode(node.getAttribute('id'));
        if (code){
            var out = '\\lstinputlisting[';
            var options = [];
            if (code.border) {
                options.push('frame=single');
            }
            if (!code.numbers) {
                options.push('numbers=none');
            }
            if(code.mode && modeToLanguage.hasOwnProperty(code.mode)){
                options.push('language=' + modeToLanguage[code.mode]);
            }
            out += options.join(',') + ']{src/codes/' + code.id + '}';
            return out;
        }
        return 'CODE\\_NOT\\_FOUND';
    }

    function imgNode2Latex(node){
        var img = editor.getGraphics(node.getAttribute('id'));
        if(img){

            var options = 'width=' + img.width + '\\textwidth';
            if (img.options) {
                options = img.options;
            }
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

                        case 'VAR':
                            out += ' ' + child.textContent + ' '; //check if too much is left out of textContent
                            break;

                        case 'B':
                            out += '\\textbf{' + handleNode(child) + '}';
                            break;

                        case 'I':
                            out += '\\emph{' + handleNode(child) + '}';
                            break;

                        case 'TT':
                            out += '\\texttt{' + handleNode(child) + '}';
                            break;

                        case 'IMG':
                            out += imgNode2Latex(child);
                            break;

                        case 'CODE':
                            out += codeNode2Latex(child);
                            break;

                        case 'P':
                            if (child.classList.contains('wysiwyg-text-align-center')) {
                                out += '\\begin{center}\n';
                                out += handleNode(child) + '\n';
                                out += '\\end{center}\n\n\n';
                            } else {
                                out += handleNode(child) + '\n\n';
                            }

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

    function answerToLatex(answer, head){
        head.push('      \\' + (answer.correct ? 'bonne' : 'mauvaise') + '{' + html2Latex(answer.content) + '}');
    }

    function choiceQuestionToLatex(question, type, head){
        var layout = question.layout === 'VERTICAL' ? 'reponses' : 'reponseshoriz';
        var beginQuestion = '  \\begin{' + type + '}{Q' + ('00' + question.number).slice(-2) + '}';
        if (question.scoring) {
            beginQuestion += '\\scoring{' + question.scoring + '}';
        }
        head.push(beginQuestion);
        head.push('\n  ' + html2Latex(question.content));
        var beginAnswers = '\n    \\begin{' + layout + '}';
        if (question.ordered) {
            beginAnswers += '[o]';
        }
        head.push(beginAnswers);
        question.answers.forEach(function(answer){
            answerToLatex(answer, head);
        });
        head.push('    \\end{' + layout + '}');
        head.push('  \\end{' + type + '}');
    }

    function openQuestionToLatex(question, head){
        var beginQuestion = '  \\begin{question}{Q' + ('00' + question.number).slice(-2) + '}';
        head.push(beginQuestion);
        head.push('\n  ' + html2Latex(question.content));
        var amcOpen = '    \\AMCOpen{';
        amcOpen += 'lines=' + question.lines;
        amcOpen += ',dots=' + (question.dots ?  'true' : 'false');
        amcOpen += '}{';
        head.push(amcOpen);
        head.push('      \\wrongchoice[W]{0pt}\\scoring{0}');

        for(var i=1; i <= question.points; i++){
            var answerType = 'wrongchoice';
            var label = 'P' + i;
            if(i === question.points) {
                answerType = 'correctchoice';
                label = 'C';
            }
            head.push('      \\' + answerType + '[' + label + ']{' + i + (i > 1 ? 'pts' : 'pt') + '}\\scoring{' + i + '}');
        }
        head.push('    }');
        head.push('  \\end{question}');
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

            case 'OPEN':
                openQuestionToLatex(question, head);
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
                    body.push('\\end{multicols}');
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
