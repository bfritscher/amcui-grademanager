import type { Component } from 'vue';
import { h } from 'vue';
import PageBreakComponent from './PageBreakComponent.vue';

import type {
  DOMConversionMap,
  DOMConversionOutput,
  LexicalNode,
  SerializedLexicalNode,
  NodeKey,
  LexicalCommand
} from 'lexical';

import { createCommand } from 'lexical';

import { DecoratorNode, COMMAND_PRIORITY_HIGH } from 'lexical';

export const INSERT_PAGE_BREAK_COMMAND: LexicalCommand<undefined> = createCommand(
  'INSERT_PAGE_BREAK_COMMAND'
);

export type SerializedPageBreakNode = SerializedLexicalNode;

export class PageBreakNode extends DecoratorNode<Component> {
  static getType(): string {
    return 'page-break';
  }

  static clone(node: PageBreakNode): PageBreakNode {
    return new PageBreakNode(node.__key);
  }

  static importJSON(): PageBreakNode {
    return $createPageBreakNode();
  }

  static importDOM(): DOMConversionMap | null {
    return {
      figure: (domNode: HTMLElement) => {
        const tp = domNode.getAttribute('type');
        if (tp !== this.getType()) {
          return null;
        }

        return {
          conversion: $convertPageBreakElement,
          priority: COMMAND_PRIORITY_HIGH
        };
      }
    };
  }

  constructor(key?: NodeKey) {
    super(key);
  }

  exportJSON(): SerializedLexicalNode {
    return {
      type: this.getType(),
      version: 1
    };
  }

  createDOM(): HTMLElement {
    const el = document.createElement('figure');
    el.style.pageBreakAfter = 'always';
    el.setAttribute('type', this.getType());
    return el;
  }

  getTextContent(): string {
    return '\n';
  }

  isInline(): false {
    return false;
  }

  updateDOM(): boolean {
    return false;
  }

  decorate(): Component {
    return h(PageBreakComponent, { nodeKey: this.__key });
  }
}

function $convertPageBreakElement(): DOMConversionOutput {
  return { node: $createPageBreakNode() };
}

export function $createPageBreakNode(): PageBreakNode {
  return new PageBreakNode();
}

export function $isPageBreakNode(node: LexicalNode | null | undefined): node is PageBreakNode {
  return node instanceof PageBreakNode;
}
