/**
 * @ngdoc service
 * @name grademanagerApp.exam
 * @description
 * # exam
 * Service in the grademanagerApp.
 */
angular.module('grademanagerApp')
    .service('exam', function ($rootScope, $stateParams, $mdDialog, API, auth) {
        'use strict';

        var editor = this;
        var DiffSyncClient = diffsync.Client;

        editor.preview = function () {
            var data = editor.toLatex();
            data.source = editor.exam.source;
            data.codes = editor.exam.codes;
            API.preview(data);
        };

        editor.print = function () {
            function print() {
                var data = editor.toLatex();
                data.source = editor.exam.source;
                data.codes = editor.exam.codes;
                API.print(data);
            }

            if (API.options.status.scanned) {
                $mdDialog.show($mdDialog.confirm()
                    .title('Warning!')
                    .content('Papers analysis was already made on the basis of the current working documents. If you modify working documents, you will not be capable any more of analyzing the papers you have already distributed!')
                    .ok('Print & Overwrite')
                    .cancel('Cancel'))
                    .then(print);

            } else {
                print();
            }
        };

        editor.load = function (callback) {
            var log = API.newLog('loading exam');
            var client = new DiffSyncClient(API.socket, API.project);
            client.on('connected', function () {
                // the initial data has been loaded,
                // you can initialize your application
                editor.exam = client.getData();
                callback(client);
                log.end = new Date();
                log.progress = 1;
                $rootScope.$apply();
            });

            client.on('synced', function () {
                // an update from the server has been applied
                // you can perform the updates in your application now
                $rootScope.$apply();
            });

            client.on('error', function (err) {
                // an update from the server has been applied
                // you can perform the updates in your application now
                console.log('error', err);
            });

            client.initialize();
        };

        editor.importJSON = function (obj) {
            if (typeof obj === 'string') {
                obj = JSON.parse(obj);
            }
            angular.copy(obj, editor.exam);
        };

        editor.loadTemplate = function (name) {
            API.loadTemplate(name)
                .then(function (source) {
                    if (editor.exam) {
                        editor.exam.source = source.data;
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
                pageBreakBefore: false,
                questions: []
            };
        };

        editor.getSection = function (id) {
            for (var i = 0; i < editor.exam.sections.length; i++) {
                if (editor.exam.sections[i].id === id) {
                    return editor.exam.sections[i];
                }
            }
            return undefined;
        };

        editor.addQuestion = function (section) {
            //copy type from previous question
            var previous;
            if (section.questions && section.questions.length > 0) {
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
                columns: 1,
                boxedAnswers: false,
                answers: []
            };
            if (previous) {
                question.type = previous.type;
                question.columns = previous.columns;
            }
            if (question.type !== 'OPEN') {
                editor.addAnswer(question);
                editor.addAnswer(question);
            }

            section.questions.push(question);
            return question;
        };

        editor.copyQuestion = function (section, question) {
            var copy = editor.addQuestion(section);
            copy.content = question.content;
            copy.type = question.type;
            copy.layout = question.layout;
            copy.ordered = question.ordered;
            copy.scoring = question.scoring;
            copy.points = question.points;
            copy.dots = question.dots;
            copy.lines = question.lines;
            copy.columns = question.columns;
            copy.boxedAnswers = question.boxedAnswers;
            copy.answers = [];

            question.answers.forEach(function (answer) {
                editor.copyAnswer(copy, answer);
            });
            return copy;
        };

        editor.removeQuestion = function (section, question) {
            section.questions.splice(section.questions.indexOf(question), 1);
        };

        editor.addAnswer = function (question) {
            var answer = {
                id: 'a' + GUID(),
                content: '<p></p>',
                correct: false
            };
            question.answers.push(answer);
            return answer;
        };

        editor.copyAnswer = function (question, answer) {
            var copy = editor.addAnswer(question);
            copy.content = answer.content;
            copy.correct = answer.correct;
            return copy;
        };

        editor.removeAnswer = function (question, answer) {
            question.answers.splice(question.answers.indexOf(answer), 1);
        };

        editor.createGraphics = function () {
            return {
                id: 'g' + GUID(),
                border: false,
                width: 0.7,
                name: ''
            };
        };

        editor.addGraphics = function (graphics) {
            if (!editor.exam.graphics) {
                editor.exam.graphics = {};
            }
            editor.exam.graphics[graphics.id] = graphics;
        };

        editor.deleteGraphics = function (graphics) {
            API.deleteGraphics(graphics)
                .then(function () {
                    delete editor.exam.graphics[graphics.id];
                });
        };

        editor.addCode = function (id) {
            var code = {
                id: id,
                border: true,
                mode: '',
                numbers: false,
                content: ''
            };
            if (!editor.exam.codes) {
                editor.exam.codes = {};
            }
            editor.exam.codes[code.id] = code;
            return code;
        };

        editor.getCode = function (id, create) {
            if (editor.exam && editor.exam.codes && editor.exam.codes.hasOwnProperty(id)) {
                return editor.exam.codes[id];
            } else {
                if (create) {
                    return editor.addCode(id);
                }
            }
            return undefined;
        };

        editor.computeHierarchyNumbers = function computeHierarchyNumbers() {
            var questionCount = 1;
            var sections = [0, 0, 0];
            for (var s = 0; s < editor.exam.sections.length; s++) {
                var section = editor.exam.sections[s];
                if (section.isNumbered) {
                    var label = '';
                    for (var i = 0; i < 3; i++) {
                        if (parseInt(section.level) === i) {
                            sections[i]++;
                        }
                        if (i > 0) {
                            label += '.';
                        }
                        label += sections[i];
                        if (parseInt(section.level) === i) {
                            //reset numbering below
                            for (var j = i + 1; j < 3; j++) {
                                sections[j] = 0;
                            }
                            section.number = label;
                            break;
                        }
                    }
                } else {
                    section.number = '';
                }
                for (var q = 0; q < section.questions.length; q++) {
                    var question = section.questions[q];
                    question.number = questionCount;
                    questionCount++;
                    //validate question
                    question.isValid = (question.type === 'OPEN' ? true : question.answers.length > 0) && (question.type === 'SINGLE' ? question.answers.reduce(function (a, b) {
                        return a + b.correct;
                    }, 0) === 1 : true);
                }
            }
        };

        editor.graphicsPreviewURL = function (id) {
            return API.PROJECT_URL + '/static/src/graphics/' + id + '_thumb.jpg?token=' + auth.getToken();
        };

        editor.getJSON = function () {
            return JSON.stringify(angular.copy(editor.exam), null, 2);
        };

        editor.getGraphics = function (id) {
            if (editor.exam && editor.exam.graphics && editor.exam.graphics.hasOwnProperty(id)) {
                return editor.exam.graphics[id];
            }
            return undefined;
        };

        editor.getGraphicsByName = function (name) {
            if (editor.exam && editor.exam.graphics) {
                for (var key in editor.exam.graphics) {
                    if (editor.exam.graphics[key].name === name) {
                        return editor.exam.graphics[key];
                    }
                }
            }
            return undefined;
        };

        // latex import

        function forEachMatch(re, str, callback) {
            var m;
            while ((m = re.exec(str)) !== null) {
                if (m.index === re.lastIndex) {
                    re.lastIndex++;
                }
                callback(m);
            }
        }

        function latex2html(html) {
            html = html.replace(/\\(?:textbf|bf){([\s\S]*?)}/g, '<b>$1</b>');
            html = html.replace(/\\(?:textit|emph){([\s\S]*?)}/g, '<i>$1</i>');
            html = html.replace(/\\newline/g, '<p>&nbsp;</p>');
            return html;
        }

        var sections = {};
        function parseLayout(latex) {
            //TODO support other section types #29
            forEachMatch(/AMCsection{(.*?)}([\s\S]*?)\\restituegroupe{(.*?)}/g, latex, function (m) {
                var section = editor.newSection();
                section.title = m[1];
                section.level = 0;
                section.isNumbered = true;
                section.isSectionTitleVisibleOnAMC = true;
                section.content = latex2html(m[2]);
                section.questions = sections[m[3]] || [];
                editor.exam.sections.push(section);
            });
        }

        function parseDefinition(latex) {
            sections = {};
            forEachMatch(/\\element{(.*?)}[\s\S]*?\\begin{(question|questionmult)}{(.*?)}([\s\S]*?)\\end{\2}/g, latex, function (m) {
                if (!sections.hasOwnProperty(m[1])) {
                    sections[m[1]] = [];
                }
                var question = {
                    id: m[3],
                    scoring: '',
                    points: 1,
                    answers: []
                };
                var rawContent = m[4];
                var match = rawContent.match(/([\s\S]*?)\\begin{(reponses|reponseshoriz)}/);
                if (match) {
                    //MultipleChoice
                    question.type = m[2] === 'question' ? 'SINGLE' : 'MULTIPLE';
                    question.content = latex2html(match[1]);
                    var answers = rawContent.match(/\\begin{(reponses|reponseshoriz)}\[?(o?)\]?([\s\S]*)\\end{\1}/);
                    question.layout = answers[1] === 'reponses' ? 'VERTICAL' : 'HORIZONTAL';
                    question.ordered = answers[2] === 'o';
                    forEachMatch(/\\(bonne|mauvaise){([\s\S]*?)}/g, answers[3], function (a) {
                        question.answers.push(
                            {
                                id: 'a' + GUID(),
                                content: a[2],
                                correct: a[1] === 'bonne'
                            }
                        );
                    });

                } else {
                    match = rawContent.match(/([\s\S]*?)\\AMCOpen/);
                    if (match) {
                        //OPEN
                        question.type = 'OPEN';
                        question.content = latex2html(match[1]);
                        var open = rawContent.match(/\\AMCOpen{(.*?)}{[\s\S]*\\bonne.*\\bareme{(\d)}/);
                        var options = open[1].match(/lines=(\d+)/);
                        if (options) {
                            question.lines = options[1];
                        }
                        options = open[1].match(/dots=(\d+)/);
                        if (options) {
                            question.dots = options[1] === 'true';
                        }
                        question.points = open[2];
                    }
                }

                sections[m[1]].push(question);
            });
            parseLayout(latex);
        }

        editor.importLatex = function (latex) {
            parseDefinition(latex);
        };

        // Latex export code

        function escapeLatex(text) {
            text = text.replace(/&nbsp;/g, ' ');
            // escape latex code
            var escapeChars = {
                '&lt;': '<',
                '&gt;': '>',
                '\\\\': '\\textbackslash ',
                '&': '\\&',
                '%': '\\%',
                '\\$': '\\$',
                '\\#': '\\#',
                '_': '\\_',
                '\\{': '\\{',
                '\\}': '\\}',
                '~': '\\textasciitilde ',
                '\\^': '\\textasciicircum '
            };
            for (var char in escapeChars) {
                if (escapeChars.hasOwnProperty(char)) {
                    var regex = new RegExp(char, 'g');
                    text = text.replace(regex, escapeChars[char]);
                }
            }

            return text;
        }

        var modeToLanguage = {
            'text/html': 'html',
            'text/css': 'html',
            'text/javascript': 'JavaScript',
            'text/x-sql': 'SQL',
            'text/x-java': 'java',
            'text/x-python': 'Python'
        };

        function codeNode2Latex(node) {
            var code = editor.getCode(node.getAttribute('id'));
            if (code) {
                var out = '\\lstinputlisting[';
                var options = [];
                if (code.border) {
                    options.push('frame=single');
                }
                if (!code.numbers) {
                    options.push('numbers=none');
                }
                if (code.mode && modeToLanguage.hasOwnProperty(code.mode)) {
                    options.push('language=' + modeToLanguage[code.mode]);
                }
                out += options.join(',') + ']{src/codes/' + code.id + '}';
                return out;
            }
            return 'CODE\\_NOT\\_FOUND';
        }

        function imgNode2Latex(node, vcenter) {
            var img = editor.getGraphics(node.getAttribute('id'));
            if (img) {

                var options = 'width=' + img.width.toFixed(2) + '\\textwidth';
                if (img.options) {
                    options = img.options;
                }
                var out = '\\includegraphics[' + options + ']{src/graphics/' + img.id + '}';
                if (img.border) {
                    out = '\\fbox{' + out + '}';
                }
                if (vcenter) {
                    out = '$\\vcenter{\\hbox{' + out + '}}$';
                }
                return out;
            }

            return 'IMG\\_NOT\\_FOUND';
        }

        function html2Latex(content, isAnswer) {
            var div = document.createElement('div');
            div.innerHTML = content;

            function nodeHasAnyChildOfType(node, type) {
                var childs = node.childNodes;
                for (var i = 0; i < childs.length; i++) {
                    if (childs[i].nodeName === type.toUpperCase()) {
                        return true;
                    }
                }
                return false;
            }

            function handleNode(node, level) {
                if (node.hasChildNodes()) {
                    var childs = node.childNodes;
                    var out = '';
                    for (var i = 0; i < childs.length; i++) {
                        var child = childs[i];
                        switch (child.nodeName) {
                        case '#text':
                            out += escapeLatex(child.textContent);
                            break;

                        case 'VAR':
                            out += ' ' + child.textContent + ' '; //check if too much is left out of textContent
                            break;

                        case 'B':
                            out += '\\textbf{' + handleNode(child, level + 1) + '}';
                            break;

                        case 'I':
                            out += '\\emph{' + handleNode(child, level + 1) + '}';
                            break;

                        case 'TT':
                            out += '\\texttt{' + handleNode(child, level + 1) + '}';
                            break;

                        case 'IMG':
                            out += imgNode2Latex(child, isAnswer);
                            break;

                        case 'CODE':
                            out += codeNode2Latex(child);
                            break;

                        case 'P':
                            if (child.classList.contains('wysiwyg-text-align-center')) {
                                out += '\\begin{center}\n';
                                out += handleNode(child, level + 1) + '\n';
                                out += '\\end{center}\n';
                            } else {
                                out += handleNode(child, level + 1);
                            }
                            if (node.childNodes.length > 1) {
                                out += '\n\n';
                            }

                            break;

                        case 'OL':
                            // LaTeX does not support empty itemize sections
                            if (nodeHasAnyChildOfType(child, 'LI')) {
                                out += '\\begin{enumerate}\n' + handleNode(child, level + 1) + '\\end{enumerate}\n';
                            }
                            break;

                        case 'UL':
                            // LaTeX does not support empty itemize sections
                            if (nodeHasAnyChildOfType(child, 'LI')) {
                                out += '\\begin{itemize}\n' + handleNode(child, level + 1) + '\\end{itemize}\n';
                            }
                            break;

                        case 'LI':
                            out += '\\item ' + handleNode(child, level + 1) + '\n';
                            break;

                        case 'BOX':
                            out += '\\fbox{\\parbox{\\textwidth}{\n' + handleNode(child, level + 1) + '}}\\newline\n';
                            break;

                        case 'HR':
                            out += '\\newpage\n';
                            break;

                        case 'H1':
                            out += '\\section*{' + handleNode(child, level + 1) + '}\n';
                            break;

                        case 'H2':
                            out += '\\subsection*{' + handleNode(child, level + 1) + '}\n';
                            break;

                        case 'H3':
                            out += '\\subsubsection*{' + handleNode(child, level + 1) + '}\n';
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
            return handleNode(div, 0);
        }

        function answerToLatex(answer, head) {
            head.push('      \\' + (answer.correct ? 'bonne' : 'mauvaise') + '{' + html2Latex(answer.content, true) + '      }');
        }

        function choiceQuestionToLatex(question, type, head) {
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
            if (question.columns && question.columns === 1 && question.boxedAnswers) {
                head.push('\n    \\AMCBoxedAnswers');
            }
            if (question.columns && question.columns > 1) {
                head.push('\n    \\begin{multicols}{' + question.columns + '}\\AMCBoxedAnswers');
            }
            head.push(beginAnswers);
            question.answers.forEach(function (answer) {
                answerToLatex(answer, head);
            });
            head.push('    \\end{' + layout + '}');
            if (question.columns && question.columns > 1) {
                head.push('    \\end{multicols}');
            }
            head.push('  \\end{' + type + '}');
        }

        function openQuestionToLatex(question, head) {
            var beginQuestion = '  \\begin{question}{Q' + ('00' + question.number).slice(-2) + '}';
            head.push(beginQuestion);
            head.push('\n  ' + html2Latex(question.content));
            if (question.lineup && question.lines > 0) {
                head.push('\n {\\setlength{\\fboxsep}{0pt}\\setlength{\\fboxrule}{1pt}\\fbox{\\begin{minipage}[t]['+ question.lines + 'cm]{\\textwidth}\\hfill\\vfill\\end{minipage}}} \n');
            }
            var amcOpen = '    \\AMCOpen{';
            amcOpen += 'lines=' + question.lines;
            if (question.lineup) {
                amcOpen += ',lineup=true';
            }
            amcOpen += ',dots=' + (question.dots ? 'true' : 'false');
            amcOpen += '}{ \\hbox{\\parbox{' + (question.lineup ? '5cm' : '13.4cm') + '}{'; // linebreak points
            head.push(amcOpen);
            head.push('      \\wrongchoice[0]{0pt}\\scoring{0}');

            for (var i = 1; i <= question.points; i++) {
                var answerType = 'wrongchoice';
                var label = i;
                if (i === question.points) {
                    answerType = 'correctchoice';
                    //label = 'C';
                }
                head.push('      \\' + answerType + '[' + label + ']{' + i + (i > 1 ? 'pts' : 'pt') + '}\\scoring{' + i + '}');
            }
            head.push('}}    }');
            head.push('  \\end{question}');
        }

        function questionToLatex(section, question, head) {
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
                break;
            default:
            }
            head.push('}');
        }

        function sectionToLatex(section, head, body) {
            //head make questions
            section.questions.forEach(function (question) {
                questionToLatex(section, question, head);
            });

            //body  build title
            if (section.pageBreakBefore) {
                body.push('\\newpage');
            }
            if (section.title !== '') {
                var title = '\n\\';
                if (section.isSectionTitleVisibleOnAMC) {
                    title += 'AMC';
                }
                title += new Array(parseInt(section.level) + 1).join('sub') + 'section';
                if (!section.isNumbered) {
                    title += '*';
                }
                title += '{' + html2Latex(section.title) + '}\n';
                body.push(title);
            }

            body.push(html2Latex(section.content));

            if (section.questions.length > 0) {
                if (section.shuffle) {
                    body.push('\\melangegroupe{' + section.id + '}');
                }
                var wrap = function (callback) {
                    callback();
                };
                if (section.columns > 1) {
                    wrap = function (callback) {
                        body.push('\\begin{multicols}{' + section.columns + '}');
                        callback();
                        body.push('\\end{multicols}');
                    };
                }
                wrap(function () {
                    if (section.content && section.content.length > 0 && section.content !== '<p></p>') {
                        body.push('\\vspace{\\baselineskip}');
                    }
                    body.push('\\restituegroupe{' + section.id + '}');
                });
            }
        }

        function migrateTemplateToProperties () {
            editor.exam.properties.course = editor.exam.course;
            editor.exam.properties.session = editor.exam.session;
            editor.exam.properties.teacher = editor.exam.teacher;
            delete editor.exam.course;
            delete editor.exam.session;
            delete editor.exam.teacher;
            editor.exam.source = editor.exam.source.replace(/\\ACMUImatiere/g, '\\AMCUIcourse');
            editor.exam.source = editor.exam.source.replace(/\\ACMUIsession/g, '\\AMCUIsession');
            editor.exam.source = editor.exam.source.replace(/\\ACMUIteacher/g, '\\AMCUIteacher');
        }

        function updatePropertiesFromLatexLayout () {
            if (!editor.exam.properties) {
                editor.exam.properties = {};
            }
            if (editor.exam.course || editor.exam.session || editor.exam.teacher) {
                migrateTemplateToProperties();
            }
            var re = /\\AMCUI([\w]+)/g;
            var match = re.exec(editor.exam.source);
            while (match !== null) {
                var key = match[1];
                if (!editor.exam.properties.hasOwnProperty(key)) {
                    editor.exam.properties[key] = '';
                }
                match = re.exec(editor.exam.source);
            }
        }

        editor.toLatex = function () {
            var head = [];
            var body = [];
            if (editor.exam && editor.exam.sections) {
                updatePropertiesFromLatexLayout();
                Object.keys(editor.exam.properties).forEach(function (key) {
                    head.push('\\newcommand{\\AMCUI' + key + '}{' + html2Latex(editor.exam.properties[key] || '') + '}');
                });


                editor.exam.sections.forEach(function (section) {
                    sectionToLatex(section, head, body);
                });
            }

            return {
                questions_definition: head.join('\n'),
                questions_layout: body.join('\n'),
                json: editor.getJSON()
            };
        };

        function moodleQuizText(xml, text) {
            var files = [];
            text = text.replace(/<img id="(.*?)">/g, function(subString, id) {
                files.push(id);
                return '<img src="@@PLUGINFILE@@/' + id +'" alt="" role="presentation" class="img-responsive atto_image_button_text-bottom">';
            });
            xml.push('<text><![CDATA[' + text + ']]></text>');
            files.forEach(function(fileId) {
                xml.push(fetch(editor.graphicsPreviewURL(fileId)).then(function(response) {
                    return response.body.getReader().read().then(function(result) {
                        return btoa(String.fromCharCode.apply(null, result.value));
                    }).then(function(b64) {
                        return '<file name="' + fileId + '" path="/" encoding="base64">' + b64 + '</file>';
                    });
                }));
            });
        }

        function moodleQuizAnswer(xml, answer, fractionCorrect) {
            xml.push('    <answer fraction="' + (answer.correct ? fractionCorrect : '0') + '" format="html">');
            moodleQuizText(xml, answer.content);
            xml.push('      <feedback format="html"><text></text></feedback>');
            xml.push('    </answer>');
        }

        function moodleQuizQuestion(xml, question) {
            xml.push('  <question type="' + (question.type === 'OPEN'? 'essay' : 'multichoice') + '">');
            xml.push('    <name>');
            xml.push('      <text>Q' + ('00' + question.number).slice(-2) + '</text>');
            xml.push('    </name>');
            xml.push('    <questiontext format="html">');
            moodleQuizText(xml, question.content);
            xml.push('    </questiontext>');
            xml.push('    <generalfeedback format="html"><text></text></generalfeedback><hidden>0</hidden>');
            if (question.type === 'SINGLE' || question.type === 'MULTIPLE') {
                xml.push('    <defaultgrade>1.0000000</defaultgrade>');
                xml.push('    <single>' + (question.type === 'SINGLE' ? 'true' : 'false') + '</single>');
                xml.push('    <penalty>0.3333333</penalty><shuffleanswers>true</shuffleanswers><answernumbering>abc</answernumbering>');
                // answers
                var fractionCorrect = 100 / question.answers.filter(function(answer) {
                    return answer.correct;
                }).length;
                question.answers.forEach(function(answer) {

                    moodleQuizAnswer(xml, answer, fractionCorrect);
                });
                if (question.type === 'MULTIPLE') {
                    moodleQuizAnswer(xml, {content: 'Aucune des réponses', correct: fractionCorrect === Infinity}, 100);
                }
            }
            if (question.type === 'OPEN') {
                xml.push('    <defaultgrade>' + question.points + '</defaultgrade>');
                xml.push('    <responseformat>editor</responseformat><responserequired>1</responserequired><responsefieldlines>15</responsefieldlines><attachments>0</attachments><attachmentsrequired>0</attachmentsrequired>');
                xml.push('    <graderinfo format="html"><text></text></graderinfo><responsetemplate format="html"><text></text></responsetemplate>');
            }
            xml.push('  </question>');
        }

        editor.toMoodleQuiz = function () {
            var xml = [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<quiz>',
            ];
            if (editor.exam && editor.exam.sections) {
                editor.exam.sections.forEach(function (section) {
                    xml.push('  <question type="category">');
                    xml.push('    <category>');
                    xml.push('      <text><![CDATA[$course$/AMCUI/' + $stateParams.project + '/' + section.title + ']]></text>');
                    xml.push('    </category>');
                    xml.push('  </question>');
                    if (section.content) {
                        xml.push('  <question type="description"><name><text>Description</text></name><questiontext format="html">');
                        moodleQuizText(xml, section.content);
                        xml.push('  </questiontext><generalfeedback format="html"><text></text></generalfeedback><defaultgrade>0.0000000</defaultgrade><penalty>0.0000000</penalty><hidden>0</hidden></question>');
                    }
                    section.questions.forEach(function(question) {
                        moodleQuizQuestion(xml, question);
                    });
                });
            }
            xml.push('</quiz>');
            return Promise.all(xml).then(function(xml) {
                $rootScope.$apply(function() {
                    var a = window.document.createElement('a');
                    a.href = window.URL.createObjectURL(new Blob([xml.join('\n')], {type: 'text/xml'}));
                    a.download = $stateParams.project + '_moodle.xml';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                });
            });
        };

    });
