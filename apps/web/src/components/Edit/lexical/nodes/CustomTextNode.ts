import {
  TextNode,
  $isTextNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type TextFormatType,
  type LexicalNode,
  type NodeKey,
  type DOMExportOutput,
  type LexicalEditor,
  type SerializedTextNode,
  type Spread
} from 'lexical';

// eslint-disable-next-line
export type SerializedCustomTextNode = Spread<{}, SerializedTextNode>;

export class CustomTextNode extends TextNode {
  static getType(): string {
    return 'custom-text';
  }

  static clone(node: CustomTextNode): CustomTextNode {
    return new CustomTextNode(node.__text, node.__key);
  }

  constructor(text: string, key?: NodeKey) {
    super(text, key);
  }

  static importDOM(): DOMConversionMap | null {
    const parent = super.importDOM();
    if (!parent) {
      return null;
    }
    parent['mark'] = () => ({
      conversion: convertTextFormatElement,
      priority: 0
    });
    return parent;
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    return super.exportDOM(editor);
  }

  static importJSON(serializedNode: SerializedCustomTextNode): CustomTextNode {
    return super.importJSON(serializedNode);
  }

  exportJSON(): SerializedCustomTextNode {
    return {
      ...super.exportJSON(),
      type: 'custom-text'
    };
  }
}

function convertTextFormatElement(domNode: HTMLElement): DOMConversionOutput {
  const format = nodeNameToTextFormat[domNode.nodeName.toLowerCase()];
  if (format === undefined) {
    return { node: null };
  }
  return {
    forChild: applyTextFormatFromStyle(domNode.style, format),
    node: null
  };
}

const nodeNameToTextFormat: Record<string, TextFormatType> = {
  code: 'code',
  em: 'italic',
  i: 'italic',
  s: 'strikethrough',
  strong: 'bold',
  sub: 'subscript',
  sup: 'superscript',
  u: 'underline',
  mark: 'highlight'
};

function applyTextFormatFromStyle(style: CSSStyleDeclaration, shouldApply?: TextFormatType) {
  return (lexicalNode: LexicalNode) => {
    if (!$isTextNode(lexicalNode)) {
      return lexicalNode;
    }

    if (shouldApply && !lexicalNode.hasFormat(shouldApply)) {
      lexicalNode.toggleFormat(shouldApply);
    }

    return lexicalNode;
  };
}
