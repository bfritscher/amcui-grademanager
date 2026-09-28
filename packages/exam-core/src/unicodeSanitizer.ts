/**
 * Utility to sanitize Unicode characters that are not supported by LaTeX
 */

export interface UnicodeReplacement {
  char: string;
  replacement: string;
  description: string;
}

// Common Unicode characters and their LaTeX-safe replacements
export const UNICODE_REPLACEMENTS: UnicodeReplacement[] = [
  // Playing card suits
  { char: '♠', replacement: '\\ensuremath{\\spadesuit}', description: 'Spade suit' },
  { char: '♣', replacement: '\\ensuremath{\\clubsuit}', description: 'Club suit' },
  { char: '♥', replacement: '\\ensuremath{\\heartsuit}', description: 'Heart suit' },
  { char: '♦', replacement: '\\ensuremath{\\diamondsuit}', description: 'Diamond suit' },

  // Special spaces
  { char: '\u202F', replacement: '\\,', description: 'Narrow no-break space' },
  { char: '\u00A0', replacement: '~', description: 'Non-breaking space' },
  { char: '\u2009', replacement: '\\,', description: 'Thin space' },

  // Common mathematical symbols
  { char: '×', replacement: '\\ensuremath{\\times}', description: 'Multiplication sign' },
  { char: '÷', replacement: '\\ensuremath{\\div}', description: 'Division sign' },
  { char: '≤', replacement: '\\ensuremath{\\leq}', description: 'Less than or equal' },
  { char: '≥', replacement: '\\ensuremath{\\geq}', description: 'Greater than or equal' },
  { char: '≠', replacement: '\\ensuremath{\\neq}', description: 'Not equal' },
  { char: '±', replacement: '\\ensuremath{\\pm}', description: 'Plus-minus' },
  { char: '°', replacement: '\\ensuremath{^\\circ}', description: 'Degree symbol' },

  // Arrows
  { char: '→', replacement: '\\ensuremath{\\rightarrow}', description: 'Right arrow' },
  { char: '←', replacement: '\\ensuremath{\\leftarrow}', description: 'Left arrow' },
  { char: '↑', replacement: '\\ensuremath{\\uparrow}', description: 'Up arrow' },
  { char: '↓', replacement: '\\ensuremath{\\downarrow}', description: 'Down arrow' },

  // Quotes
  { char: '\u201C', replacement: "''", description: 'Left double quotation mark' },
  { char: '\u201D', replacement: "''", description: 'Right double quotation mark' },
  { char: '\u2018', replacement: '`', description: 'Left single quotation mark' },
  { char: '\u2019', replacement: "'", description: 'Right single quotation mark' },

  // Dashes
  { char: '\u2014', replacement: '---', description: 'Em dash' },
  { char: '\u2013', replacement: '--', description: 'En dash' },

  // Ellipsis
  { char: '…', replacement: '\\ldots', description: 'Ellipsis' }
];

/**
 * Sanitize text by replacing known problematic Unicode characters
 */
export function sanitizeUnicode(text: string): string {
  let sanitized = text;

  // Replace known characters
  for (const replacement of UNICODE_REPLACEMENTS) {
    sanitized = sanitized.replace(new RegExp(replacement.char, 'g'), replacement.replacement);
  }

  return sanitized;
}
