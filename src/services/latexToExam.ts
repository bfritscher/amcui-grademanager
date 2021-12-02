import { v4 as uuidv4 } from 'uuid';
import ExamEditor from './examEditor';

export default function latexToExam(latex:string, editor:ExamEditor) {
  const sections:any = {};
  forEachMatch(
    /\\element{(.*?)}[\s\S]*?\\begin{(question|questionmult)}{(.*?)}([\s\S]*?)\\end{\2}/g,
    latex,
    (m) => {
      if (!sections.hasOwnProperty(m[1])) {
        sections[m[1]] = [];
      }
      const question = editor.createQuestion();
      question.id = m[3];
      const rawContent = m[4];
      let match = rawContent.match(
        /([\s\S]*?)\\begin{(reponses|reponseshoriz)}/
      );
      if (match) {
        //MultipleChoice
        question.type = m[2] === 'question' ? 'SINGLE' : 'MULTIPLE';
        question.content = latex2html(match[1]);
        const answers = rawContent.match(
          /\\begin{(reponses|reponseshoriz)}\[?(o?)\]?([\s\S]*)\\end{\1}/
        ) || [];
        question.layout = answers[1] === 'reponses' ? 'VERTICAL' : 'HORIZONTAL';
        question.ordered = answers[2] === 'o';
        forEachMatch(/\\(bonne|mauvaise){([\s\S]*?)}/g, answers[3], (a) => {
          question.answers.push({
            id: 'a' + uuidv4(),
            content: a[2],
            correct: a[1] === 'bonne',
          });
        });
      } else {
        match = rawContent.match(/([\s\S]*?)\\AMCOpen/);
        if (match) {
          //OPEN
          question.type = 'OPEN';
          question.content = latex2html(match[1]);
          const open = rawContent.match(
            /\\AMCOpen{(.*?)}{[\s\S]*\\bonne.*\\bareme{(\d)}/
          ) || [];
          let options = open[1].match(/lines=(\d+)/);
          if (options) {
            question.lines = parseInt(options[1], 10);
          }
          options = open[1].match(/dots=(\d+)/);
          if (options) {
            question.dots = options[1] === 'true';
          }
          question.points = parseInt(open[2], 10);
        }
      }

      sections[m[1]].push(question);
    }
  );
  parseLayout(latex, editor, sections);
}

function forEachMatch(re: RegExp, str:string, callback: (m:RegExpExecArray) => void) {
  let m;
  while ((m = re.exec(str)) !== null) {
    if (m.index === re.lastIndex) {
      re.lastIndex++;
    }
    callback(m);
  }
}

function parseLayout(latex:string, editor:ExamEditor, sections:any) {
  //TODO-nice support other section types #29
  forEachMatch(
    /AMCsection{(.*?)}([\s\S]*?)\\restituegroupe{(.*?)}/g,
    latex,
    (m) => {
      const section = editor.createSection();
      section.title = m[1];
      section.level = 0;
      section.isNumbered = true;
      section.isSectionTitleVisibleOnAMC = true;
      section.content = latex2html(m[2]);
      section.questions = sections[m[3]] || [];
      editor.exam.sections.push(section);
    }
  );
}

function latex2html(html:string) {
  html = html.replace(/\\(?:textbf|bf){([\s\S]*?)}/g, '<b>$1</b>');
  html = html.replace(/\\(?:textit|emph){([\s\S]*?)}/g, '<i>$1</i>');
  html = html.replace(/\\newline/g, '<p>&nbsp;</p>');
  return html;
}
