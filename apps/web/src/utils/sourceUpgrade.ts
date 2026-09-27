function ensurePackage(latexCode: string, packageName: string): string {
  if (latexCode.includes(`\\usepackage{${packageName}}`)) {
    return latexCode;
  }
  const lines = latexCode.split('\n');
  lines.splice(1, 0, `\\usepackage{${packageName}}`);
  const updatedLatexCode = lines.join('\n');
  return updatedLatexCode;
}

function replaceTabularxWithTabulary(latexCode: string): string {
  return latexCode.replace(/{tabularx}/g, '{tabulary}');
}

export default function sourceUpgrade(sourceCode: string): string {
  sourceCode = ensurePackage(sourceCode, 'soul');
  sourceCode = replaceTabularxWithTabulary(sourceCode);
  sourceCode = ensurePackage(sourceCode, 'tabulary');
  return sourceCode;
}
