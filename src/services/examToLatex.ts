import { useExamStore } from '@/stores/exam';
import type { Section, Question, Answer } from '../components/models';
import {
  WIDTH_DATA_ATTRIBUTE,
  OPTIONS_DATA_ATTRIBUTE,
  BORDER_DATA_ATTRIBUTE
} from '@/components/Edit/lexical/nodes/ImageNode';

export default function examToLatex() {
  const editor = useExamStore();

  const head: string[] = [];
  const body: string[] = [];
  if (editor.exam && editor.exam.sections) {
    editor.exam.sections.forEach((section) => {
      sectionToLatex(section, head, body);
    });
    Object.keys(editor.exam.properties).forEach((key) => {
      head.unshift(
        '\\newcommand{\\AMCUI' + key + '}{' + html2Latex(editor.exam.properties[key] || '') + '}'
      );
    });
  }

  return {
    questions_definition: head.join('\n'),
    questions_layout: body.join('\n'),
    json: editor.getJSON()
  };
}

function escapeLatex(text: string | null) {
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
    '\\^': '\\textasciicircum '
  } as { [key: string]: string };
  for (const char in escapeChars) {
    if (Object.prototype.hasOwnProperty.call(escapeChars, char)) {
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
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

export function html2Latex(content: string, isAnswer = false) {
  const div = document.createElement('div');
  div.innerHTML = content;

  function nodeHasAnyChildOfType(node: HTMLElement, type: string) {
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
      if (children[i].nodeName === type.toUpperCase()) {
        return true;
      }
    }
    return false;
  }

  function handleCenter(node: HTMLElement, callback: () => string) {
    let out = '';
    if (node.classList.contains('wysiwyg-text-align-center') || node.style.textAlign === 'center') {
      out += '\\begin{center}\n';
      out += callback() + '\n';
      out += '\\end{center}\n';
    } else {
      out += callback();
    }
    return out;
  }

  function handleNode(node: HTMLElement, level: number) {
    if (node.hasChildNodes()) {
      const children = node.childNodes;
      let out = '';

      for (let i = 0; i < children.length; i++) {
        const child = children[i] as HTMLElement;

        switch (child.nodeName) {
          case '#text':
            out += escapeLatex(child.textContent);
            break;
          case 'SPAN':
            out += handleNode(child, level + 1);
            break;
          case 'MARK':
          case 'VAR': // support legacy editor
            out += ' ' + child.textContent + ' '; //check if too much is left out of textContent
            break;

          case 'B':
            out += '\\textbf{' + handleNode(child, level + 1) + '}';
            break;
          // skip use B
          case 'STRONG':
            out += handleNode(child, level + 1);
            break;

          case 'I':
            out += '\\emph{' + handleNode(child, level + 1) + '}';
            break;
          case 'EM':
            out += handleNode(child, level + 1);
            break;
          case 'U':
            out += '\\underline{' + handleNode(child, level + 1) + '}';
            break;
          // support legacy editor
          case 'TT':
            out += '\\texttt{' + handleNode(child, level + 1) + '}';
            break;

          case 'SUB':
            out += '\\textsubscript{' + handleNode(child, level + 1) + '}';
            break;

          case 'SUP':
            out += '\\textsuperscript{' + handleNode(child, level + 1) + '}';
            break;

          case 'S':
            out += '\\st{' + handleNode(child, level + 1) + '}';
            break;

          case 'IMG':
            out += imgNode2Latex(child, isAnswer);
            break;

          case 'CODE':
            // support legacy editor
            if (child.hasAttribute('id') && !child.hasAttribute('data-border')) {
              out += codeNode2Latex(child);
            } else if (child.hasAttribute('id') && child.hasAttribute('data-border')) {
              out += lexcialCodeNode2Latex(child);
            } else {
              out += '\\texttt{' + handleNode(child, level + 1) + '}';
            }
            break;
          case 'PRE':
            out += lexcialCodeNode2Latex(child);
            break;
          case 'P':
            if (
              child.textContent?.length === 0 &&
              (child.children.length === 0 || child.children[0].tagName === 'BR')
            ) {
              out += '\\vspace{\\baselineskip}\n';
              break;
            }
            out += handleCenter(child, () => handleNode(child, level + 1));
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
            if (nodeHasAnyChildOfType(child, 'OL') || nodeHasAnyChildOfType(child, 'UL')) {
              out += handleNode(child, level + 1) + '\n';
            } else {
              out += '\\item ' + handleCenter(child, () => handleNode(child, level + 1)) + '\n';
            }
            break;

          case 'BOX':
            out +=
              '\\fbox{\\parbox{\\textwidth}{\n' + handleNode(child, level + 1) + '}}\\newline\n';
            break;

          case 'HR':
            out += '\\vspace{1em}\n\\hrule\n\\vspace{1em}\n';
            break;

          case 'H1':
            out += '\\section*{' + handleCenter(child, () => handleNode(child, level + 1)) + '}\n';
            break;

          case 'H2':
            out +=
              '\\subsection*{' + handleCenter(child, () => handleNode(child, level + 1)) + '}\n';
            break;

          case 'H3':
            out +=
              '\\subsubsection*{' + handleCenter(child, () => handleNode(child, level + 1)) + '}\n';
            break;

          case 'FIGURE':
            if (child.hasAttribute('type') && child.getAttribute('type') === 'page-break') {
              out += '\\newpage\n';
            }
            break;

          case 'TABLE': {
            // get number of td in first tr
            const firstTr = child.querySelector('tr');
            if (!firstTr) {
              break;
            }
            const tdCount = firstTr.querySelectorAll('td').length;
            out +=
              '{\n\\bigskip\n\\centering\n\\begin{tabulary}{\\textwidth}{|' +
              'L|'.repeat(tdCount) +
              '}\n';
            out += '\\hline\n';
            // for each tr
            const trs = child.querySelectorAll('tr');
            for (let i = 0; i < trs.length; i++) {
              const tr = trs[i];
              const tds = tr.querySelectorAll('td');
              for (let j = 0; j < tds.length; j++) {
                out += handleNode(tds[j], level + 1);
                if (j < tds.length - 1) {
                  out += ' & ';
                }
              }
              out += ' \\\\ \\hline\n';
            }
            out += handleNode(child, level + 1);
            out += '\\end{tabulary}\\par\n}\n\\bigskip\n';
            break;
          }
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
  'text/x-python': 'Python'
} as { [key: string]: string };

const lexicalToMode = {
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  sql: 'text/x-sql',
  java: 'text/x-java',
  py: 'text/x-python',
  '': 'text/html'
} as { [key: string]: string };

function lexcialCodeNode2Latex(node: HTMLElement) {
  const editor = useExamStore();
  node.innerHTML = node.innerHTML.replace(/<br>/g, '\n');
  const code = {
    id: node.getAttribute('id') || '',
    content: node.innerText || '',
    border: node.getAttribute('data-border') === 'true',
    numbers: node.getAttribute('data-numbers') === 'true',
    mode: lexicalToMode[node.getAttribute('data-highlight-language') ?? '']
  };
  const examCode = editor.getCode(code.id, true);
  if (examCode) {
    examCode.content = code.content;
    examCode.border = code.border;
    examCode.numbers = code.numbers;
    examCode.mode = code.mode;
  }

  let out = '\\lstinputlisting[';
  const options = [];
  if (code.border) {
    options.push('frame=single');
  }
  if (!code.numbers) {
    options.push('numbers=none');
  }
  if (code.mode && Object.prototype.hasOwnProperty.call(modeToLanguage, code.mode)) {
    options.push('language=' + modeToLanguage[code.mode]);
  }
  out += options.join(',') + ']{src/codes/' + code.id + '}';
  return out;
}

function codeNode2Latex(node: HTMLElement) {
  const editor = useExamStore();
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
    if (code.mode && Object.prototype.hasOwnProperty.call(modeToLanguage, code.mode)) {
      options.push('language=' + modeToLanguage[code.mode]);
    }
    out += options.join(',') + ']{src/codes/' + code.id + '}';
    return out;
  }
  return 'CODE\\_NOT\\_FOUND';
}

function imgNode2Latex(node: HTMLElement, vcenter: boolean) {
  const editor = useExamStore();

  const img = editor.getGraphics(node.getAttribute('id')) || {
    id: node.getAttribute('id'),
    width: 0.7,
    border: false,
    options: ''
  };

  if (node.hasAttribute(WIDTH_DATA_ATTRIBUTE)) {
    img.width = parseInt(node.getAttribute(WIDTH_DATA_ATTRIBUTE) || '70', 10) / 100;
  }
  if (node.hasAttribute(BORDER_DATA_ATTRIBUTE)) {
    img.border = node.getAttribute(BORDER_DATA_ATTRIBUTE) === 'true';
  }
  if (node.hasAttribute(OPTIONS_DATA_ATTRIBUTE)) {
    img.options = node.getAttribute(OPTIONS_DATA_ATTRIBUTE) || '';
  }

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

function sectionToLatex(section: Section, head: string[], body: string[]) {
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
    let wrap = (callback: () => void) => {
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
      if (section.content && section.content.length > 0 && section.content !== '<p></p>') {
        body.push('\\vspace{\\baselineskip}');
      }
      body.push('\\restituegroupe{' + section.id + '}');
    });
  }
}

function questionToLatex(section: Section, question: Question, head: string[]) {
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
  let beginQuestion = '  \\begin{' + type + '}{Q' + ('00' + question.number).slice(-2) + '}';
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
    head.push('\n    \\begin{multicols}{' + question.columns + '}\\AMCBoxedAnswers');
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

function openQuestionToLatex(question: Question, head: string[]) {
  const answerboxId = `\\answerbox${numberToAlpha(question.number || 0)}`;
  if (question.answer) {
    const savebox = [];
    const saveboxStart = `\\newsavebox{${answerboxId}}
\\savebox{${answerboxId}}{%
  \\begin{minipage}[t]{14cm}
    \\color{red}{%`;
    savebox.push(saveboxStart);
    savebox.push('\n  ' + html2Latex(question.answer));
    const saveboxEnd = `    }
  \\end{minipage}
}`;
    savebox.push(saveboxEnd);
    head.unshift(...savebox);
  }
  const beginQuestion = '  \\begin{question}{Q' + ('00' + question.number).slice(-2) + '}';
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
  amcOpen += '}{ \\hbox{\\parbox{' + (question.lineup ? '5cm' : '14.4cm') + '}{'; // linebreak points
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
  let content = '      \\' +
      (answer.correct ? 'bonne' : 'mauvaise') +
      '{' +
      html2Latex(answer.content, true) +
      '      }'
  if (answer.scoring) {
    content += '\\scoring{' + answer.scoring + '}';
  }
  head.push(content);
}
