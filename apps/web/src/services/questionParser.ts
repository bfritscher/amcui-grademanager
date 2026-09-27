import type { PartialQuestion, PartialAnswer } from '../components/models';

function isQuestionLine(line: string): boolean {
  // Check for "Question X" format or numbered question format (e.g., "3)" or "3.")
  return /^(?:Question\s+\d+|^\d+[).])\s*/i.test(line);
}

function cleanQuestionText(line: string): string {
  // Remove question number prefixes like "13)" or "Question 13" or "Question number 13"
  return line.replace(/^(?:\d+[).]\s*|Question\s+(?:number\s+)?\d+\s*:?)/i, '').trim();
}

function letterToIndex(letter: string): number {
  // Convert A-Z to 0-25
  return letter.toUpperCase().charCodeAt(0) - 65;
}

export function parseQuestions(text: string): PartialQuestion[] {
  const questions: PartialQuestion[] = [];
  const lines = text.split('\n');

  let currentQuestion: PartialQuestion | null = null;
  let collectingAnswers = false;
  let lastLineWasEmpty = false;
  let consecutiveEmptyLines = 0;
  let answerPattern: string | null = null;
  let pendingText = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Handle empty lines
    if (line.length === 0) {
      consecutiveEmptyLines++;
      // Only process as question break if we have 2 or more empty lines
      if (consecutiveEmptyLines >= 2) {
        if (currentQuestion?.content) {
          currentQuestion.content = currentQuestion.content.trim();
        }
        if (currentQuestion && currentQuestion.answers && currentQuestion.answers.length > 0) {
          questions.push(currentQuestion);
          currentQuestion = null;
        }
        collectingAnswers = false;
        answerPattern = null;
        pendingText = '';
      }
      lastLineWasEmpty = true;
      continue;
    }

    consecutiveEmptyLines = 0;

    // Check for answer indicators (both English and French, case insensitive)
    // Matches "Bonnes réponses : A, B, D" or "Answer: B" or "Réponse: 2", etc.
    const answerIndicator = line.match(
      /^.*?(?:answer|r[ée]ponses?).*:\s*(.+)$/i
    );
    if (answerIndicator && currentQuestion && currentQuestion.answers) {
      // Extract the answer part (e.g., "A, B, D" or "A et C" or "B" or "2")
      const answerText = answerIndicator[1].trim();

      // Split by commas and/or 'et'/'and' to extract all answers
      const answerParts = answerText
        .split(/(?:,|\s+et\s+|\s+and\s+)/i)
        .map(part => part.trim())
        .filter(part => part.length > 0);
      // Reset all answers to incorrect first
      currentQuestion.answers.forEach((a) => (a.correct = false));

      // Mark all specified answers as correct
      for (const answerPart of answerParts) {
        // Remove any trailing punctuation like ), ., etc.
        const cleanAnswer = answerPart.replace(/[).\s]+$/, '');

        let correctIndex = -1;
        // Check if it's a letter (A, B, C, etc.)
        if (/^[A-Za-z]$/.test(cleanAnswer)) {
          correctIndex = letterToIndex(cleanAnswer);
        }
        // Check if it's a number (1, 2, 3, etc.)
        else if (/^\d+$/.test(cleanAnswer)) {
          correctIndex = parseInt(cleanAnswer, 10) - 1;
        }

        if (correctIndex >= 0 && correctIndex < currentQuestion.answers.length) {
          currentQuestion.answers[correctIndex].correct = true;
        }
      }

      // Update question type to MULTIPLE if more than one answer is marked as correct
      const correctCount = currentQuestion.answers.filter(a => a.correct).length;
      if (correctCount > 1) {
        currentQuestion.type = 'MULTIPLE';
      }

      continue;
    }

    // If we're already in a question, check for answers first
    if (currentQuestion) {
      const answerInfo = parseAnswerLine(line, answerPattern);
      if (answerInfo.answer) {
        // Set the answer pattern for consistent answer parsing
        if (!answerPattern && answerInfo.pattern) {
          answerPattern = answerInfo.pattern;
        }

        if (pendingText) {
          currentQuestion.content += ' ' + pendingText;
          pendingText = '';
        }

        if (answerInfo.answer.correct && currentQuestion.type === 'SINGLE') {
          const hasCorrectAnswer = currentQuestion.answers?.some((a) => a.correct);
          if (hasCorrectAnswer) {
            currentQuestion.type = 'MULTIPLE';
          }
        }
        currentQuestion.answers?.push(answerInfo.answer);
        lastLineWasEmpty = false;
        continue;
      }
    }

    // Only check for new question if we didn't find an answer
    if (isQuestionLine(line)) {
      if (currentQuestion) {
        questions.push(currentQuestion);
      }
      currentQuestion = {
        content: cleanQuestionText(line),
        type: 'SINGLE',
        answers: []
      };
      collectingAnswers = true;
      lastLineWasEmpty = false;
      continue;
    }

    // Start new question if we're not collecting answers and last line was empty
    if (!collectingAnswers && lastLineWasEmpty && !isAnswerLine(line)) {
      currentQuestion = {
        content: line,
        type: 'SINGLE',
        answers: []
      };
      collectingAnswers = true;
      lastLineWasEmpty = false;
      continue;
    }

    // Handle answer lines
    if (currentQuestion) {
      const answerInfo = parseAnswerLine(line, answerPattern);
      if (answerInfo.answer) {
        // Set the answer pattern for consistent answer parsing
        if (!answerPattern && answerInfo.pattern) {
          answerPattern = answerInfo.pattern;
        }

        if (pendingText) {
          currentQuestion.content += ' ' + pendingText;
          pendingText = '';
        }

        if (answerInfo.answer.correct && currentQuestion.type === 'SINGLE') {
          const hasCorrectAnswer = currentQuestion.answers?.some((a) => a.correct);
          if (hasCorrectAnswer) {
            currentQuestion.type = 'MULTIPLE';
          }
        }
        currentQuestion.answers?.push(answerInfo.answer);
      } else if (!isAnswerLine(line)) {
        // If not an answer line, append to question content or pending text
        // Add a space if we had a single empty line before
        const prefix = lastLineWasEmpty ? ' ' : '';
        if (collectingAnswers && currentQuestion.answers?.length === 0) {
          currentQuestion.content += prefix + line;
        } else {
          pendingText += (pendingText ? prefix : '') + line;
        }
      }
    } else if (!isAnswerLine(line)) {
      // Start new question for non-numbered questions
      currentQuestion = {
        content: line,
        type: 'SINGLE',
        answers: []
      };
      collectingAnswers = true;
    }

    lastLineWasEmpty = false;
  }

  // Add the last question if exists
  if (currentQuestion && currentQuestion.answers && currentQuestion.answers.length > 0) {
    if (pendingText) {
      currentQuestion.content += ' ' + pendingText;
    }
    currentQuestion.content = currentQuestion.content?.trim();
    questions.push(currentQuestion);
  }

  return questions;
}

function isAnswerLine(line: string): boolean {
  const patterns = [
    /^[A-Za-z][).]\s/, // A) or a) or A. or a.
    /^[-*+]\s/, // - or * or +
    /^(?:-\s*)?\[\s*[xX\s]\s*\]/, // [ ] or [x] or [X] or - [ ] or - [x] or - [X]
    /^[1-9]\d*[).]\s/ // 1) or 1. (must start with non-zero digit)
  ];
  return patterns.some((pattern) => pattern.test(line));
}

function parseAnswerLine(
  line: string,
  existingPattern: string | null
): {
  answer?: PartialAnswer;
  pattern?: string;
} {
  const patterns = {
    alphabetic: /^([A-Za-z])[).](?:\s*\[([xX\s])\])?\s*(.*?)(?:\s*=>\s*(.*?))?$/,
    numeric: /^(\d+)[).](?:\s*\[([xX\s])\])?\s*(.*?)(?:\s*=>\s*(.*?))?$/,
    dash: /^(?:-\s*)?\[([xX\s])\]\s*(.*?)(?:\s*=>\s*(.*?))?$|^[-*+]\s*(.*?)(?:\s*=>\s*(.*?))?$/
  } as { [key: string]: RegExp };

  let match: RegExpMatchArray | null = null;
  let pattern = '';

  // Try to match using the existing pattern first
  if (existingPattern && patterns[existingPattern]) {
    match = line.match(patterns[existingPattern]);
    pattern = existingPattern;
  }

  // If no match, try all patterns
  if (!match) {
    for (const [key, regex] of Object.entries(patterns)) {
      match = line.match(regex);
      if (match) {
        pattern = key;
        break;
      }
    }
  }

  if (!match) return {};

  let correct = false;
  let content = '';

  if (pattern === 'dash') {
    // Handle dash format as before
    if (match[0].includes('[')) {
      const [, checked, text, answer] = match;
      correct = checked === 'x' || checked === 'X';
      content = answer || text;
    } else {
      const [, , , , text, answer] = match;
      correct = match[0].startsWith('*') || match[0].startsWith('+');
      content = answer || text;
    }
  } else {
    // Handle both numeric and alphabetic formats the same way
    const [, , checked, text, answer] = match;
    // Only mark as correct if explicitly checked
    correct = checked ? checked === 'x' || checked === 'X' : false;
    content = answer || text;
  }

  return {
    pattern,
    answer: {
      content: content.trim(),
      correct
    }
  };
}
