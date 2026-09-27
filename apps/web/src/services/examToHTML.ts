import { useExamStore } from '@/stores/exam';
import { useApiStore } from '@/stores/api';
import type { Question, Answer } from '../components/models';

export default function examToHTML() {
  const editor = useExamStore();
  const API = useApiStore();
  const html = ['<!DOCTYPE html>', '<html>'];
  if (editor.exam && editor.exam.sections) {
    editor.exam.sections.forEach((section) => {
      html.push('  <section>');
      html.push(`<h${section.level}>${section.title}</h${section.level}>`);
      if (section.content) {
        htmlQuizText(html, section.content);
      }
      section.questions.forEach((question) => {
        htmlQuizQuestion(html, question);
      });
      html.push('  </section>');
    });
  }
  html.push('</html>');
  return Promise.all(html).then((html) => {
    const a = window.document.createElement('a');
    a.href = window.URL.createObjectURL(new Blob([html.join('\n')], { type: 'text/html' }));
    a.download = API.project + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
}

function htmlQuizQuestion(html: string[], question: Question) {
  html.push(
    '  <div>'
    //(question.type === 'OPEN' ? 'essay' : 'multichoice') +
  );
  html.push('      <h4>Q' + ('00' + question.number).slice(-2) + '</h4>');
  htmlQuizText(html, question.content);
  if (question.type === 'SINGLE' || question.type === 'MULTIPLE') {
    html.push('      <ul>');
    // answers
    const fractionCorrect =
      100 /
      question.answers.filter((answer) => {
        return answer.correct;
      }).length;
    question.answers.forEach((answer) => {
      htmlQuizAnswer(html, answer);
    });
    if (question.type === 'MULTIPLE') {
      htmlQuizAnswer(html, {
        id: '',
        content: 'Aucune des réponses',
        correct: fractionCorrect === Infinity
      });
    }
    html.push('      </ul>');
  }
  if (question.type === 'OPEN') {
    // html.push('    <defaultgrade>' + question.points + '</defaultgrade>');
  }
  html.push('  </div>');
}

function htmlQuizAnswer(html: string[], answer: Answer) {
  html.push('    <li>' + (answer.correct ? '✓' : '✗'));
  htmlQuizText(html, answer.content);
  html.push('    </li>');
}

function htmlQuizText(html: (string | Promise<string>)[], text: string) {
  const editor = useExamStore();
  // TODO: code?
  const promises: Promise<string>[] = [];
  text.replace(/<img id="(.*?)">/g, (subString, id: string) => {
    const p = fetch(editor.graphicsPreviewURL(id)).then((response: any) => {
      return response.blob().then(convertBlobToBase64);
    }) as Promise<string>;
    promises.push(p);
    return '';
  });
  html.push(
    Promise.all(promises).then((results) => {
      text = text.replace(/<img id="(.*?)">/g, (subString, id: string) => {
        const b64 = results.shift();
        return `<img src="data:image/jpg;charset=utf-8;base64, ${b64}" alt="${id}"/>`;
      });
      return text;
    })
  );
}

function convertBlobToBase64(blob: Blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      resolve((reader.result as string).split(',')[1]);
    };
    reader.readAsDataURL(blob);
  });
}
