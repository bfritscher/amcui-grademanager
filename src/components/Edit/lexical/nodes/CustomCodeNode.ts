import { CodeNode } from '@lexical/code';
import { $applyNodeReplacement, $isLineBreakNode } from 'lexical';
import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedElementNode,
  Spread,
  LexicalUpdateJSON
} from 'lexical';

import { addClassNamesToElement, isHTMLElement } from '@lexical/utils';

export const ID_ATTRIBUTE = 'id';
export const BORDER_DATA_ATTRIBUTE = 'data-border';
export const NUMBERS_DATA_ATTRIBUTE = 'data-numbers';
export const LANGUAGE_DATA_ATTRIBUTE = 'data-language';
export const HIGHLIGHT_LANGUAGE_DATA_ATTRIBUTE = 'data-highlight-language';
import { v4 as uuidv4 } from 'uuid';

export type SerializedCustomCodeNode = Spread<
  {
    language: string | null | undefined;
    id: string | null | undefined;
    border: boolean;
    numbers: boolean;
  },
  SerializedElementNode
>;

export class CustomCodeNode extends CodeNode {
  __id: string | null | undefined;
  __border: boolean;
  __numbers: boolean;
  // inherited __language

  static getType(): string {
    return 'custom-code';
  }

  static clone(node: CustomCodeNode): CustomCodeNode {
    return new CustomCodeNode(
      node.__language,
      node.__id,
      node.__border,
      node.__numbers,
      node.__key
    );
  }

  constructor(
    language?: string | null | undefined,
    id?: string | null | undefined,
    border?: boolean,
    numbers?: boolean,
    key?: NodeKey
  ) {
    super(language, key);
    this.__id = id || `code${uuidv4()}`;
    this.__border = typeof border === 'boolean' ? border : true;
    this.__numbers = typeof numbers === 'boolean' ? numbers : false;
    this.__language = this.__language || 'javascript';
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    const id = this.getId();
    if (id) {
      dom.setAttribute(ID_ATTRIBUTE, id);
    }
    dom.setAttribute(BORDER_DATA_ATTRIBUTE, String(this.getBorder()));
    dom.setAttribute(NUMBERS_DATA_ATTRIBUTE, String(this.getNumbers()));
    return dom;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    super.updateDOM(prevNode, dom, config);
    dom.setAttribute(ID_ATTRIBUTE, this.__id || '');
    dom.setAttribute(BORDER_DATA_ATTRIBUTE, String(this.__border));
    dom.setAttribute(NUMBERS_DATA_ATTRIBUTE, String(this.__numbers));
    return false;
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const element = document.createElement('code');
    addClassNamesToElement(element, editor._config.theme.code);
    element.setAttribute('spellcheck', 'false');
    const language = this.getLanguage();
    if (language) {
      element.setAttribute(LANGUAGE_DATA_ATTRIBUTE, language);

      if (this.getIsSyntaxHighlightSupported()) {
        element.setAttribute(HIGHLIGHT_LANGUAGE_DATA_ATTRIBUTE, language);
      }
    }
    const id = this.getId();
    if (id) {
      element.setAttribute(ID_ATTRIBUTE, id);
    }
    element.setAttribute(BORDER_DATA_ATTRIBUTE, String(this.getBorder()));
    element.setAttribute(NUMBERS_DATA_ATTRIBUTE, String(this.getNumbers()));
    const children = this.getChildren();
    const childrenLength = children.length;

    let gutter = '1';
    let count = 1;
    for (let i = 0; i < childrenLength; i++) {
      if ($isLineBreakNode(children[i])) {
        gutter += '\n' + ++count;
      }
    }

    element.setAttribute('data-gutter', gutter);
    return { element };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      // Typically <pre> is used for code blocks, and <code> for inline code styles
      // but if it's a multi line <code> we'll create a block. Pass through to
      // inline format handled by TextNode otherwise.
      code: (node: Node) => {
        const isMultiLine =
          node.textContent != null &&
          (/\r?\n/.test(node.textContent) ||
            hasChildDOMNodeTag(node, 'BR') ||
            (isHTMLElement(node) && node.classList.contains('le__code')));
        return isMultiLine ? { conversion: $convertPreElement, priority: 2 } : null;
      },
      pre: () => ({ conversion: $convertPreElement, priority: 0 })
    };
  }

  static importJSON(serializedNode: SerializedCustomCodeNode): CustomCodeNode {
    const node = $createCustomCodeNode(
      serializedNode.language,
      serializedNode.id,
      serializedNode.border,
      serializedNode.numbers
    ).updateFromJSON(serializedNode);
    return node;
  }

  updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedCustomCodeNode>): this {
    const node = super.updateFromJSON(serializedNode);
    node.setId(serializedNode.id);
    node.setBorder(serializedNode.border);
    node.setNumbers(serializedNode.numbers);
    return node;
  }

  exportJSON(): SerializedCustomCodeNode {
    return {
      ...super.exportJSON(),
      id: this.getId(),
      border: this.getBorder(),
      numbers: this.getNumbers(),
      type: 'custom-code',
    };
  }

  getId(): string | null | undefined {
    return this.getLatest().__id;
  }

  getBorder(): boolean {
    return this.getLatest().__border;
  }

  getNumbers(): boolean {
    return this.getLatest().__numbers;
  }

  setId(id: string | null | undefined): void {
    const writable = this.getWritable();
    writable.__id = id;
  }

  setBorder(border: boolean): void {
    const writable = this.getWritable();
    writable.__border = border;
  }
  setNumbers(numbers: boolean): void {
    const writable = this.getWritable();
    writable.__numbers = numbers;
  }
}

export function $createCustomCodeNode(
  language?: string | null | undefined,
  id?: string | null | undefined,
  border?: boolean,
  numbers?: boolean
): CustomCodeNode {
  return $applyNodeReplacement(new CustomCodeNode(language, id, border, numbers));
}

function $convertPreElement(domNode: HTMLElement): DOMConversionOutput {
  const language = domNode.getAttribute(LANGUAGE_DATA_ATTRIBUTE);
  const id = domNode.getAttribute(ID_ATTRIBUTE);
  const border = domNode.getAttribute(BORDER_DATA_ATTRIBUTE) === 'true';
  const numbers = domNode.getAttribute(NUMBERS_DATA_ATTRIBUTE) === 'true';
  return { node: $createCustomCodeNode(language, id, border, numbers) };
}

function hasChildDOMNodeTag(node: Node, tagName: string) {
  for (const child of node.childNodes) {
    if (isHTMLElement(child) && child.tagName === tagName) {
      return true;
    }
    hasChildDOMNodeTag(child, tagName);
  }
  return false;
}

export function $isCustomCodeNode(node: LexicalNode | null | undefined): node is CustomCodeNode {
  return node instanceof CustomCodeNode;
}
