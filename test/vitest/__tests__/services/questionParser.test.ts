import { describe, it, expect } from 'vitest';
import { parseQuestions } from '../../../../src/services/questionParser';


describe('questionParser', () => {
  describe('question format detection', () => {
    it('should parse numbered questions', () => {
      const input = `3) What is recursion?
A) A function that calls itself
B) A loop statement
C) A data structure
Answer: A`;

      const result = parseQuestions(input);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('What is recursion?');
    });

    it('should parse "Question X" format', () => {
      const input = `Question 13
What is polymorphism?
A) Method overriding
B) Method overloading
C) Both A and B
Réponse: C`;

      const result = parseQuestions(input);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('What is polymorphism?');
    });

    it('should handle multi-line questions', () => {
      const input = `Question 1
Consider the following code:
int x = 5;
int y = x++;
What is the value of y?

A) 4
B) 5
C) 6
Answer: B`;

      const result = parseQuestions(input);
      expect(result).toHaveLength(1);
      expect(result[0].content).toContain('Consider the following code:');
      expect(result[0].content).toContain('int x = 5;');
    });
  });

  describe('answer format detection', () => {
    it('should parse alphabetic answers', () => {
      const input = `What is Git?
A) A programming language
B) A version control system
C) A database
Answer: B`;

      const result = parseQuestions(input);
      expect(result[0].answers).toHaveLength(3);
      expect(result[0].answers![1].correct).toBe(true);
      expect(result[0].answers![1].content).toBe('A version control system');
    });

    it('should parse numeric answers', () => {
      const input = `Select the correct statement:
1) Java is purely object oriented
2) Java supports multiple inheritance
3) Java supports method overloading
Answer: 3`;

      const result = parseQuestions(input);
      expect(result[0].answers).toHaveLength(3);
      expect(result[0].answers![2].correct).toBe(true);
    });

    it('should parse dash/plus/star answers', () => {
      const input = `Which are valid HTTP methods?
- GET
+ POST
* PUT
- SEND`;

      const result = parseQuestions(input);
      expect(result[0].answers).toHaveLength(4);
      expect(result[0].answers![1].correct).toBe(true);
      expect(result[0].answers![2].correct).toBe(true);
    });

    it('should parse checkbox style answers', () => {
      const input = `Select valid JavaScript data types:
[x] Number
[ ] Character
[X] String
[ ] Integer`;

      const result = parseQuestions(input);
      expect(result[0].answers).toHaveLength(4);
      expect(result[0].answers![0].correct).toBe(true);
      expect(result[0].answers![2].correct).toBe(true);
    });

    it('should parse checkbox answers with and without dash', () => {
      const input = `Select valid options:
[ ] Option 1
[x] Option 2
- [ ] Option 3
- [X] Option 4`;

      const result = parseQuestions(input);
      expect(result[0].answers).toHaveLength(4);
      expect(result[0].answers![0].correct).toBe(false);
      expect(result[0].answers![1].correct).toBe(true);
      expect(result[0].answers![2].correct).toBe(false);
      expect(result[0].answers![3].correct).toBe(true);
    });

    it('should properly handle numbered questions vs numbered answers', () => {
      const input = `3) What is the capital of France?
1) London
2) Paris
3) Berlin
Answer: 2


4) What is 2+2?
1) Three
2) Four
3) Five
Answer: 2`;

      const result = parseQuestions(input);
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('What is the capital of France?');
      expect(result[1].content).toBe('What is 2+2?');
      expect(result[0].answers![1].correct).toBe(true);
      expect(result[1].answers![1].correct).toBe(true);
    });
  });

  describe('answer indicators', () => {
    it('should handle Answer: format', () => {
      const input = `What is HTML?
A) Hypertext Markup Language
B) High Technical Modern Language
C) Hypertext Modern Layout
Answer: A`;

      const result = parseQuestions(input);
      expect(result[0].answers![0].correct).toBe(true);
    });

    it('should handle Réponse: format', () => {
      const input = `Qu'est-ce que HTML?
A) Hypertext Markup Language
B) High Technical Modern Language
C) Hypertext Modern Layout
Réponse: A`;

      const result = parseQuestions(input);
      expect(result[0].answers![0].correct).toBe(true);
    });

    it('should handle case-insensitive answer indicators', () => {
      const inputs = [
        'answer: A',
        'Answer: A',
        'ANSWER: A',
        'réponse: A',
        'Réponse: A',
        'REPONSE: A'
      ];

      inputs.forEach(suffix => {
        const input = `Test question?\nA) Yes\nB) No\n${suffix}`;
        const result = parseQuestions(input);
        expect(result[0].answers![0].correct).toBe(true);
      });
    });

    it('should handle multiple answers separated by commas', () => {
      const input = `What are primary colors?
A) Red
B) Green
C) Blue
D) Yellow
Answer: A, C, D`;

      const result = parseQuestions(input);
      expect(result[0].answers![0].correct).toBe(true);  // Red
      expect(result[0].answers![1].correct).toBe(false); // Green
      expect(result[0].answers![2].correct).toBe(true);  // Blue
      expect(result[0].answers![3].correct).toBe(true);  // Yellow
      expect(result[0].type).toBe('MULTIPLE');
    });

    it('should handle multiple numeric answers', () => {
      const input = `Select valid options:
1) Option One
2) Option Two
3) Option Three
4) Option Four
Answer: 1, 2, 4`;

      const result = parseQuestions(input);
      expect(result[0].answers![0].correct).toBe(true);
      expect(result[0].answers![1].correct).toBe(true);
      expect(result[0].answers![2].correct).toBe(false);
      expect(result[0].answers![3].correct).toBe(true);
    });

    it('should ignore text before answer indicator', () => {
      const input = `Question 2
Quels éléments font partie d'un Système d'Information (SI) ?
A. Données
B. Processus métier
C. Salle de réunion
D. Utilisateurs
Bonnes réponses : A, B, D`;

      const result = parseQuestions(input);
      expect(result).toHaveLength(1);
      expect(result[0].content).toContain('Quels éléments');
      expect(result[0].answers).toHaveLength(4);
      expect(result[0].answers![0].correct).toBe(true);  // A. Données
      expect(result[0].answers![1].correct).toBe(true);  // B. Processus métier
      expect(result[0].answers![2].correct).toBe(false); // C. Salle de réunion
      expect(result[0].answers![3].correct).toBe(true);  // D. Utilisateurs
      expect(result[0].type).toBe('MULTIPLE');
    });

    it('should handle answers separated by "et" (and)', () => {
      const input = `What are correct?
A) First
B) Second
C) Third
Answer: A et C`;

      const result = parseQuestions(input);
      expect(result[0].answers![0].correct).toBe(true);  // A
      expect(result[0].answers![1].correct).toBe(false); // B
      expect(result[0].answers![2].correct).toBe(true);  // C
      expect(result[0].type).toBe('MULTIPLE');
    });

    it('should handle mixed comma and "et" separators', () => {
      const input = `Select all that apply:
1) Option 1
2) Option 2
3) Option 3
4) Option 4
Réponse: 1, 2 et 4`;

      const result = parseQuestions(input);
      expect(result[0].answers![0].correct).toBe(true);  // 1
      expect(result[0].answers![1].correct).toBe(true);  // 2
      expect(result[0].answers![2].correct).toBe(false); // 3
      expect(result[0].answers![3].correct).toBe(true);  // 4
      expect(result[0].type).toBe('MULTIPLE');
    });
  });

  describe('multiple questions handling', () => {
    it('should separate questions by double empty lines', () => {
      const input = `What is 2+2?
A) 3
B) 4
C) 5
Answer: B


What is 3+3?
A) 5
B) 6
C) 7
Answer: B`;

      const result = parseQuestions(input);
      expect(result).toHaveLength(2);
    });

    it('should handle mixed answer formats across questions', () => {
      const input = `Q1: Multiple choice
A) Option 1
B) Option 2
Answer: A


Q2: Checkboxes
[x] Option 1
[ ] Option 2


Q3: Dash format
+ Correct
- Wrong`;

      const result = parseQuestions(input);
      expect(result).toHaveLength(3);
      expect(result[0].answers![0].correct).toBe(true);
      expect(result[1].answers![0].correct).toBe(true);
      expect(result[2].answers![0].correct).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle questions with single empty lines in content', () => {
      const input = `Consider the code:
x = 1

y = 2

What is x + y?
A) 1
B) 2
C) 3
Answer: C`;

      const result = parseQuestions(input);
      expect(result).toHaveLength(1);
      expect(result[0].content).toContain('x = 1');
      expect(result[0].content).toContain('y = 2');
    });

    it('should handle answers with special characters', () => {
      const input = `Select the correct SQL query:
A) SELECT * FROM users;
B) SELECT * FROM users WHERE id = 1;
C) SELECT * FROM users WHERE id > 0;
Answer: B`;

      const result = parseQuestions(input);
      expect(result[0].answers).toHaveLength(3);
      expect(result[0].answers![1].correct).toBe(true);
    });

    it('should detect multiple correct answers', () => {
      const input = `Which are prime numbers?
[x] 2
[x] 3
[ ] 4
[x] 5`;

      const result = parseQuestions(input);
      expect(result[0].type).toBe('MULTIPLE');
    });
  });
});
