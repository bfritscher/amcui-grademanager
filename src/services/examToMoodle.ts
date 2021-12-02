import ExamEditor from './examEditor';
import {Question, Answer} from '../components/models';

let editor: ExamEditor;
export default function examToMoodle(localEditor: ExamEditor) {
  editor = localEditor;
  const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<quiz>'];
  if (editor.exam && editor.exam.sections) {
    editor.exam.sections.forEach((section) => {
      xml.push('  <question type="category">');
      xml.push('    <category>');
      xml.push(
        '      <text><![CDATA[$course$/AMCUI/' +
        editor.API.project +
          '/' +
          section.title +
          ']]></text>'
      );
      xml.push('    </category>');
      xml.push('  </question>');
      if (section.content) {
        xml.push(
          '  <question type="description"><name><text>Description</text></name><questiontext format="html">'
        );
        moodleQuizText(xml, section.content);
        xml.push(
          '  </questiontext><generalfeedback format="html"><text></text></generalfeedback><defaultgrade>0.0000000</defaultgrade><penalty>0.0000000</penalty><hidden>0</hidden></question>'
        );
      }
      section.questions.forEach((question) => {
        moodleQuizQuestion(xml, question);
      });
    });
  }
  xml.push('</quiz>');
  return Promise.all(xml).then((xml) => {
    const a = window.document.createElement('a');
    a.href = window.URL.createObjectURL(
      new Blob([xml.join('\n')], { type: 'text/xml' })
    );
    a.download = editor.API.project + '_moodle.xml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
}

function moodleQuizQuestion(xml: string[], question:Question) {
  xml.push(
    '  <question type="' +
      (question.type === 'OPEN' ? 'essay' : 'multichoice') +
      '">'
  );
  xml.push('    <name>');
  xml.push('      <text>Q' + ('00' + question.number).slice(-2) + '</text>');
  xml.push('    </name>');
  xml.push('    <questiontext format="html">');
  moodleQuizText(xml, question.content);
  xml.push('    </questiontext>');
  xml.push(
    '    <generalfeedback format="html"><text></text></generalfeedback><hidden>0</hidden>'
  );
  if (question.type === 'SINGLE' || question.type === 'MULTIPLE') {
    xml.push('    <defaultgrade>1.0000000</defaultgrade>');
    xml.push(
      '    <single>' +
        (question.type === 'SINGLE' ? 'true' : 'false') +
        '</single>'
    );
    xml.push(
      '    <penalty>0.3333333</penalty><shuffleanswers>true</shuffleanswers><answernumbering>abc</answernumbering>'
    );
    // answers
    const fractionCorrect =
      100 /
      question.answers.filter((answer) => {
        return answer.correct;
      }).length;
    question.answers.forEach((answer) => {
      moodleQuizAnswer(xml, answer, fractionCorrect);
    });
    if (question.type === 'MULTIPLE') {
      moodleQuizAnswer(
        xml,
        {
          id: '',
          content: 'Aucune des réponses',
          correct: fractionCorrect === Infinity,
        },
        100
      );
    }
  }
  if (question.type === 'OPEN') {
    xml.push('    <defaultgrade>' + question.points + '</defaultgrade>');
    xml.push(
      '    <responseformat>editor</responseformat><responserequired>1</responserequired><responsefieldlines>15</responsefieldlines><attachments>0</attachments><attachmentsrequired>0</attachmentsrequired>'
    );
    xml.push(
      '    <graderinfo format="html"><text></text></graderinfo><responsetemplate format="html"><text></text></responsetemplate>'
    );
  }
  xml.push('  </question>');
}

function moodleQuizAnswer(xml:string[], answer:Answer, fractionCorrect:number) {
  xml.push(
    '    <answer fraction="' +
      (answer.correct ? fractionCorrect : '0') +
      '" format="html">'
  );
  moodleQuizText(xml, answer.content);
  xml.push('      <feedback format="html"><text></text></feedback>');
  xml.push('    </answer>');
}

function moodleQuizText(xml: (string|Promise<string>)[], text: string) {
  const files: string[] = [];
  text = text.replace(/<img id="(.*?)">/g, (subString, id:string) => {
    files.push(id);
    return (
      '<img src="@@PLUGINFILE@@/' +
      id +
      '" alt="" role="presentation" class="img-responsive atto_image_button_text-bottom">'
    );
  });
  xml.push('<text><![CDATA[' + text + ']]></text>');
  files.forEach((fileId) => {
    xml.push(
      fetch(editor.graphicsPreviewURL(fileId))
        .then((response) => {
          return response.blob().then(convertBlobToBase64);
        })
        .then((b64) => {
          return (
            '<file name="' +
            fileId +
            '" path="/" encoding="base64">' +
            b64 +
            '</file>'
          );
        })
    );
  });
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
