import { useExamStore } from '@/stores/exam';

export default function latexToExam(latex: string) {
  const examStore = useExamStore();

  forEachMatch(
    /\\element{(.*?)}[\s\S]*?\\begin{(question|questionmult)}{(.*?)}([\s\S]*?)\\end{\2}/g,
    latex,
    (m) => {
      const question = examStore.createQuestion();
      question.id = m[3];
      const rawContent = m[4];
      let match = rawContent.match(/([\s\S]*?)\\begin{(reponses|reponseshoriz)}/);
      if (match) {
        //MultipleChoice
        question.type = m[2] === 'question' ? 'SINGLE' : 'MULTIPLE';
        question.content = latex2html(match[1]);
        const answers =
          rawContent.match(/\\begin{(reponses|reponseshoriz)}\[?(o?)\]?([\s\S]*)\\end{\1}/) || [];
        question.layout = answers[1] === 'reponses' ? 'VERTICAL' : 'HORIZONTAL';
        question.ordered = answers[2] === 'o';
        forEachMatch(/\\(bonne|mauvaise){([\s\S]*?)}/g, answers[3], (a, index) => {
          const answer = examStore.createAnswer(question);
          answer.order = index;
          answer.content = latex2html(a[2]);
          answer.correct = a[1] === 'bonne';
          examStore.saveAnswer(answer);
        });
      } else {
        match = rawContent.match(/([\s\S]*?)\\AMCOpen/);
        if (match) {
          //OPEN
          question.type = 'OPEN';
          question.content = latex2html(match[1]);
          const open = rawContent.match(/\\AMCOpen{(.*?)}{[\s\S]*\\bonne.*\\bareme{(\d)}/) || [];
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
      question.section = m[1];
      examStore.saveQuestion(question);
    }
  );
  parseLayout(latex);
}

function forEachMatch(
  re: RegExp,
  str: string,
  callback: (m: RegExpExecArray, index: number) => void
) {
  let m;
  let i = 0;
  while ((m = re.exec(str)) !== null) {
    if (m.index === re.lastIndex) {
      re.lastIndex++;
    }
    callback(m, i);
    i++;
  }
}

function parseLayout(latex: string) {
  const editor = useExamStore();
  //TODO-nice support other section types #29
  forEachMatch(/AMCsection{(.*?)}([\s\S]*?)\\restituegroupe{(.*?)}/g, latex, (m) => {
    const section = editor.createSection();
    section.title = m[1];
    section.level = 0;
    section.isNumbered = true;
    section.isSectionTitleVisibleOnAMC = true;
    section.content = latex2html(m[2]);
    section.id = m[3];
    editor.addSection(section);
  });
}

function latex2html(html: string) {
  html = html.replace(/\\(?:textbf|bf){([\s\S]*?)}/g, '<b>$1</b>');
  html = html.replace(/\\(?:textit|emph){([\s\S]*?)}/g, '<i>$1</i>');
  html = html.replace(/\\newline/g, '<p>&nbsp;</p>');
  return html;
}
