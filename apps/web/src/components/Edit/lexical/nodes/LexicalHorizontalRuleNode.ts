/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { Component } from 'vue';
import { h } from 'vue';
import HorizontalRuleComponent from './HorizontalRuleComponent.vue';

import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  SerializedLexicalNode,
  NodeKey,
  LexicalCommand
} from 'lexical';

import { addClassNamesToElement } from '@lexical/utils';
import { $applyNodeReplacement, DecoratorNode, createCommand } from 'lexical';

export const INSERT_HORIZONTAL_RULE_COMMAND: LexicalCommand<void> = createCommand(
  'INSERT_HORIZONTAL_RULE_COMMAND'
);

export type SerializedHorizontalRuleNode = SerializedLexicalNode;

export class HorizontalRuleNode extends DecoratorNode<Component> {
  static getType(): string {
    return 'horizontalrule';
  }

  static clone(node: HorizontalRuleNode): HorizontalRuleNode {
    return new HorizontalRuleNode(node.__key);
  }

  static importJSON(serializedNode: SerializedHorizontalRuleNode): HorizontalRuleNode {
    return $createHorizontalRuleNode().updateFromJSON(serializedNode);
  }

  static importDOM(): DOMConversionMap | null {
    return {
      hr: () => ({
        conversion: $convertHorizontalRuleElement,
        priority: 0
      })
    };
  }

  constructor(key?: NodeKey) {
    super(key);
  }

  exportJSON(): SerializedLexicalNode {
    return {
      ...super.exportJSON(),
      type: 'horizontalrule'
    };
  }

  exportDOM(editor: any): DOMExportOutput {
    const { element } = super.exportDOM(editor);
    return { element };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement('hr');
    addClassNamesToElement(element, config.theme.hr);
    return element;
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
    return h(HorizontalRuleComponent, { nodeKey: this.__key });
  }
}

function $convertHorizontalRuleElement(): DOMConversionOutput {
  return { node: $createHorizontalRuleNode() };
}

export function $createHorizontalRuleNode(): HorizontalRuleNode {
  return $applyNodeReplacement(new HorizontalRuleNode());
}

export function $isHorizontalRuleNode(
  node: LexicalNode | null | undefined
): node is HorizontalRuleNode {
  return node instanceof HorizontalRuleNode;
}
