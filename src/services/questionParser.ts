import type { Question, Answer } from '../components/models';

export function parseQuestions(text: string): Partial<Question>[] {
  const questions: Partial<Question>[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  let currentQuestion: Partial<Question> | null = null;
  
  for (let line of lines) {
    // Check if line is a question (doesn't start with answer markers)
    if (!isAnswerLine(line)) {
      if (currentQuestion) {
        questions.push(currentQuestion);
      }
      currentQuestion = {
        content: line,
        type: 'SINGLE',
        answers: []
      };
    } else if (currentQuestion) {
      // Parse answer
      const answer = parseAnswer(line);
      if (answer) {
        if (answer.correct && currentQuestion.type === 'SINGLE') {
          // If we already have a correct answer, switch to multiple choice
          const hasCorrectAnswer = currentQuestion.answers?.some(a => a.correct);
          if (hasCorrectAnswer) {
            currentQuestion.type = 'MULTIPLE';
          }
        }
        currentQuestion.answers?.push(answer);
      }
    }
  }
  
  if (currentQuestion) {
    questions.push(currentQuestion);
  }
  
  return questions;
}

function isAnswerLine(line: string): boolean {
  return /^[-*+A-Z)\d)]|\[\s*[xX\s]\s*\]/.test(line);
}

function parseAnswer(line: string): Partial<Answer> {
  // Remove common answer markers
  let correct = false;
  line = line.replace(/^[-+A-Z)\d)]\s*|\[\s*([xX\s])\s*\]\s*/, (match, checked) => {
    if (match.includes('*') || match.includes('+') || checked === 'x' || checked === 'X') {
      correct = true;
    }
    return '';
  });
  
  return {
    content: line,
    correct
  };
}
