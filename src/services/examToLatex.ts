import ExamEditor from './examEditor';
import { Section, Question, Answer } from '../components/models';

let editor: ExamEditor;
export default function examToLatex(localEditor: ExamEditor) {
  const head: string[] = [];
  const body: string[] = [];
  editor = localEditor;
  if (editor.exam && editor.exam.sections) {
    editor.exam.sections.forEach((section) => {
      sectionToLatex(section, head, body);
    });
    // put at the top
    updatePropertiesFromLatexLayout(editor);
    Object.keys(editor.exam.properties).forEach((key) => {
      head.unshift(
        '\\newcommand{\\AMCUI' +
          key +
          '}{' +
          html2Latex(editor.exam.properties[key] || '') +
          '}'
      );
    });
  }

  return {
    questions_definition: head.join('\n'),
    questions_layout: body.join('\n'),
    json: editor.getJSON(),
  };
}

function updatePropertiesFromLatexLayout(editor: ExamEditor) {
  if (!editor.exam.properties) {
    editor.exam.properties = {};
  }
  const re = /\\AMCUI([\w]+)/g;
  let match = re.exec(editor.exam.source);
  while (match !== null) {
    const key = match[1];
    if (!editor.exam.properties.hasOwnProperty(key)) {
      editor.exam.properties[key] = '';
    }
    match = re.exec(editor.exam.source);
  }
}

function escapeLatex(text: string|null) {
  if (!text) {
    return '';
  }
  text = text.replace(/&nbsp;/g, ' ');
  // escape latex code
  const escapeChars = {
    '\\r\\n': ' ',
    '\\n': ' ',
    '&lt;': '<',
    '&gt;': '>',
    '\\\\': '\\textbackslash ',
    '&': '\\&',
    '%': '\\%',
    '\\$': '\\$',
    '\\#': '\\#',
    _: '\\_',
    '\\{': '\\{',
    '\\}': '\\}',
    '~': '\\textasciitilde ',
    '\\^': '\\textasciicircum ',
  } as { [key: string]: string };
  for (const char in escapeChars) {
    if (escapeChars.hasOwnProperty(char)) {
      const regex = new RegExp(char, 'g');
      text = text.replace(regex, escapeChars[char]);
    }
  }

  return text;
}

function numberToAlpha(n: number) {
  if (n <= 0) throw Error('numberToAlpha: n must be positive and non-zero');
  n = n - 1;
  let result = '';
  while (n >= 0) {
    result = String.fromCharCode(n % 26 + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
};

function html2Latex(content: string, isAnswer = false) {
  const div = document.createElement('div');
  div.innerHTML = content;

  function nodeHasAnyChildOfType(node:HTMLElement, type:string) {
    const childs = node.childNodes;
    for (let i = 0; i < childs.length; i++) {
      if (childs[i].nodeName === type.toUpperCase()) {
        return true;
      }
    }
    return false;
  }

  function handleNode(node: HTMLElement, level:number) {
    if (node.hasChildNodes()) {
      const childs = node.childNodes;
      let out = '';
      for (let i = 0; i < childs.length; i++) {
        const child = childs[i] as HTMLElement;
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
              out +=
                '\\begin{enumerate}\n' +
                handleNode(child, level + 1) +
                '\\end{enumerate}\n';
            }
            break;

          case 'UL':
            // LaTeX does not support empty itemize sections
            if (nodeHasAnyChildOfType(child, 'LI')) {
              out +=
                '\\begin{itemize}\n' +
                handleNode(child, level + 1) +
                '\\end{itemize}\n';
            }
            break;

          case 'LI':
            out += '\\item ' + handleNode(child, level + 1) + '\n';
            break;

          case 'BOX':
            out +=
              '\\fbox{\\parbox{\\textwidth}{\n' +
              handleNode(child, level + 1) +
              '}}\\newline\n';
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
      return node.textContent || '';
    }
  }
  return handleNode(div, 0);
}

const modeToLanguage = {
  'text/html': 'html',
  'text/css': 'html',
  'text/javascript': 'JavaScript',
  'text/x-sql': 'SQL',
  'text/x-java': 'java',
  'text/x-python': 'Python',
} as { [key: string]: string };

function codeNode2Latex(node: HTMLElement) {
  const code = editor.getCode(node.getAttribute('id'));
  if (code) {
    let out = '\\lstinputlisting[';
    const options = [];
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

function imgNode2Latex(node: HTMLElement, vcenter: boolean) {
  const img = editor.getGraphics(node.getAttribute('id'));
  if (img) {
    let options = 'width=' + img.width.toFixed(2) + '\\textwidth';
    if (img.options) {
      options = img.options;
    }
    let out = '\\includegraphics[' + options + ']{src/graphics/' + img.id + '}';
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

function sectionToLatex(section: Section, head:string[], body:string[]) {
  //head make questions
  section.questions.forEach((question) => {
    questionToLatex(section, question, head);
  });

  //body  build title
  if (section.pageBreakBefore) {
    body.push('\\newpage');
  }
  if (section.title !== '') {
    let title = '\n\\';
    if (section.isSectionTitleVisibleOnAMC) {
      title += 'AMC';
    }
    const level = typeof section.level === 'number' ? section.level : parseInt(section.level, 10);
    title += new Array(level + 1).join('sub') + 'section';
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
    let wrap = (callback:()=>void) => {
      callback();
    };
    if (section.columns > 1) {
      wrap = (callback) => {
        body.push('\\begin{multicols}{' + section.columns + '}');
        callback();
        body.push('\\end{multicols}');
      };
    }
    wrap(() => {
      if (
        section.content &&
        section.content.length > 0 &&
        section.content !== '<p></p>'
      ) {
        body.push('\\vspace{\\baselineskip}');
      }
      body.push('\\restituegroupe{' + section.id + '}');
    });
  }
}

function questionToLatex(section: Section, question: Question, head:string[]) {
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

function choiceQuestionToLatex(question: Question, type: string, head: string[]) {
  const layout = question.layout === 'VERTICAL' ? 'reponses' : 'reponseshoriz';
  let beginQuestion =
    '  \\begin{' + type + '}{Q' + ('00' + question.number).slice(-2) + '}';
  if (question.scoring) {
    beginQuestion += '\\scoring{' + question.scoring + '}';
  }
  head.push(beginQuestion);
  head.push('\n  ' + html2Latex(question.content));
  let beginAnswers = '\n    \\begin{' + layout + '}';
  if (question.ordered) {
    beginAnswers += '[o]';
  }
  if (question.columns && question.columns === 1 && question.boxedAnswers) {
    head.push('\n    \\AMCBoxedAnswers');
  }
  if (question.columns && question.columns > 1) {
    head.push(
      '\n    \\begin{multicols}{' + question.columns + '}\\AMCBoxedAnswers'
    );
  }
  head.push(beginAnswers);
  question.answers.forEach((answer) => {
    answerToLatex(answer, head);
  });
  head.push('    \\end{' + layout + '}');
  if (question.columns && question.columns > 1) {
    head.push('    \\end{multicols}');
  }
  head.push('  \\end{' + type + '}');
}

function openQuestionToLatex(question: Question, head:string[]) {
  const answerboxId = `\\answerbox${numberToAlpha(question.number || 0)}`;
  if (question.answer) {
    const savebox = [];
    const saveboxStart = `\\newsavebox{${answerboxId}}
\\savebox{${answerboxId}}{%
  \\begin{minipage}[t]{14cm}
    \\color{red}{%`;
    savebox.push(saveboxStart)
    savebox.push('\n  ' + html2Latex(question.answer));
    const saveboxEnd = `    }
  \\end{minipage}
}`;
    savebox.push(saveboxEnd)
    head.unshift(...savebox);
  }
  const beginQuestion =
    '  \\begin{question}{Q' + ('00' + question.number).slice(-2) + '}';
  head.push(beginQuestion);
  head.push('\n  ' + html2Latex(question.content));
  if (question.lineup && question.lines > 0) {
    head.push(
      '\n {\\setlength{\\fboxsep}{0pt}\\setlength{\\fboxrule}{1pt}\\fbox{\\begin{minipage}[t][' +
        question.lines +
        'cm]{\\textwidth}\\hfill\\vfill\\end{minipage}}} \n'
    );
  }
  let amcOpen = '    \\AMCOpen{';
  amcOpen += 'lines=' + question.lines;
  if (question.lineup) {
    amcOpen += ',lineup=true';
  }
  if (question.answer) {
    amcOpen += `,answer=\\usebox{${answerboxId}}`;
  }
  amcOpen += ',dots=' + (question.dots ? 'true' : 'false');
  amcOpen +=
    '}{ \\hbox{\\parbox{' + (question.lineup ? '5cm' : '14.4cm') + '}{'; // linebreak points
  head.push(amcOpen);
  head.push('      \\wrongchoice[0]{0pt}\\scoring{0}');

  for (let i = 1; i <= question.points; i++) {
    let answerType = 'wrongchoice';
    const label = i;
    if (i === question.points) {
      answerType = 'correctchoice';
      //label = 'C';
    }
    head.push(
      '      \\' +
        answerType +
        '[' +
        label +
        ']{' +
        i +
        (i > 1 ? 'pts' : 'pt') +
        '}\\scoring{' +
        i +
        '}'
    );
  }
  head.push('}}    }');
  head.push('  \\end{question}');
}
function answerToLatex(answer: Answer, head: string[]) {
  head.push(
    '      \\' +
      (answer.correct ? 'bonne' : 'mauvaise') +
      '{' +
      html2Latex(answer.content, true) +
      '      }'
  );
}
