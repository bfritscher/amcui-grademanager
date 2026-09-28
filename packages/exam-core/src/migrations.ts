import type * as Y from 'yjs';

function ensurePackage(latexCode: string, packageName: string): string {
  if (latexCode.includes(`\\usepackage{${packageName}}`)) {
    return latexCode;
  }
  const lines = latexCode.split('\n');
  lines.splice(1, 0, `\\usepackage{${packageName}}`);
  return lines.join('\n');
}

function replaceTabularxWithTabulary(latexCode: string): string {
  return latexCode.replace(/{tabularx}/g, '{tabulary}');
}

export function upgradeSource(sourceCode: string): string {
  if (!sourceCode) return sourceCode;
  sourceCode = ensurePackage(sourceCode, 'soul');
  sourceCode = replaceTabularxWithTabulary(sourceCode);
  sourceCode = ensurePackage(sourceCode, 'tabulary');
  return sourceCode;
}

// Run before exposing a loaded document to either browser or MCP clients.
// Patch existing maps in place so persisted CRDT identities remain stable.
export function migrateDocument(doc: Y.Doc): void {
  doc.transact(() => {
    const text = doc.getText('source');
    const upgraded = upgradeSource(text.toString());
    if (upgraded !== text.toString()) {
      text.delete(0, text.length);
      text.insert(0, upgraded);
    }
    for (const kind of ['sections', 'questions']) {
      for (const entity of doc.getMap<Y.Map<unknown>>(kind).values()) {
        for (const key of kind === 'sections' ? ['level', 'columns'] : ['columns', 'lines']) {
          const value = entity.get(key);
          if (typeof value === 'string' && Number.isFinite(Number(value)))
            entity.set(key, Number(value));
        }
        if (kind === 'questions') {
          for (const key of ['lineup', 'boxedAnswers'])
            if (!entity.has(key)) entity.set(key, false);
          if (entity.get('type') === 'OPEN' && !entity.has('answer')) entity.set('answer', '');
        }
      }
    }
  }, 'migration');
}
