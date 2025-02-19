import { describe, expect, it } from 'vitest';
import sourceUpgrade from '../../../../src/utils/sourceUpgrade';

describe('Source Upgrade', () => {
  it('adds soul package and tabulary', () => {
    const sourceCode = `\\documentclass{article}`;
    const upgradedSourceCode = sourceUpgrade(sourceCode);
    expect(upgradedSourceCode).toEqual('\\documentclass{article}\n\\usepackage{tabulary}\n\\usepackage{soul}');
  });
  it('renames tabulary package', () => {
    const sourceCode = `\\documentclass{article}\n\\usepackage{tabularx}\n\n\\begin{tabularx}\n\\end{tabularx}`;
    const upgradedSourceCode = sourceUpgrade(sourceCode);
    expect(upgradedSourceCode).toEqual('\\documentclass{article}\n\\usepackage{soul}\n\\usepackage{tabulary}\n\n\\begin{tabulary}\n\\end{tabulary}');
  });
});
