import { ElementNode, $createParagraphNode } from 'lexical';

import type {
  DOMConversionMap,
  DOMConversionOutput,
  LexicalNode,
  LexicalCommand,
  SerializedElementNode,
  DOMExportOutput,
  LexicalEditor,
  LexicalUpdateJSON
} from 'lexical';

import { createCommand } from 'lexical';

export const INSERT_BOX_COMMAND: LexicalCommand<undefined> = createCommand('INSERT_BOX_COMMAND');

export class BoxNode extends ElementNode {
  static getType(): string {
    return 'box';
  }

  static clone(node: BoxNode): BoxNode {
    return new BoxNode(node.__key);
  }

  createDOM(): HTMLElement {
    const dom = document.createElement('box');
    return dom;
  }

  updateDOM(): boolean {
    // Returning false tells Lexical that this node does not need its
    // DOM element replacing with a new copy from createDOM.
    return false;
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const { element } = super.exportDOM(editor);
    return { element };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      box: () => ({
        conversion: (): DOMConversionOutput => {
          return { node: new BoxNode() };
        },
        priority: 0
      })
    };
  }

  exportJSON(): SerializedElementNode {
    return {
      ...super.exportJSON(),
      type: 'box'
    };
  }

  static importJSON(serializedNode: SerializedElementNode): BoxNode {
    return $createBoxNode().updateFromJSON(serializedNode);
  }

  updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedElementNode>): this {
    const node = super.updateFromJSON(serializedNode);
    node.setFormat(serializedNode.format);
    node.setIndent(serializedNode.indent);
    node.setDirection(serializedNode.direction);
    return node;
  }
}

export function $createBoxNode(): BoxNode {
  return new BoxNode().append($createParagraphNode());
}

export function $isBoxNode(node: LexicalNode | null | undefined): node is BoxNode {
  return node instanceof BoxNode;
}
