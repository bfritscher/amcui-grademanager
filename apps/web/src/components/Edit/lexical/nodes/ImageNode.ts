/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { Component } from 'vue';
import { h } from 'vue';
import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
  LexicalCommand,
  LexicalUpdateJSON
} from 'lexical';

import { $applyNodeReplacement, DecoratorNode, createCommand } from 'lexical';
import ImageComponent from './ImageComponent.vue';
import type { Graphics } from '@/components/models';

export const INSERT_IMAGE_COMMAND: LexicalCommand<Graphics> = createCommand('INSERT_IMAGE_COMMAND');

export interface ImagePayload {
  id: string;
  border: boolean;
  width: number;
  name: string;
  options?: string;
  key?: NodeKey;
}

export const ID_ATTRIBUTE = 'id';
export const BORDER_DATA_ATTRIBUTE = 'data-border';
export const OPTIONS_DATA_ATTRIBUTE = 'data-options';
export const WIDTH_DATA_ATTRIBUTE = 'data-width';

function $convertImageElement(domNode: HTMLElement): DOMConversionOutput {
  const node = $createImageNode({
    id: domNode.getAttribute(ID_ATTRIBUTE) || '', // TODO: id?
    border: domNode.getAttribute(BORDER_DATA_ATTRIBUTE) === 'true' || false,
    width: parseFloat(domNode.getAttribute(WIDTH_DATA_ATTRIBUTE) || '100'),
    name: domNode.getAttribute('alt') || '',
    options: domNode.getAttribute(OPTIONS_DATA_ATTRIBUTE) || ''
  });
  return { node };
}

export type SerializedImageNode = Spread<
  { id: string; border: boolean; width: number; name: string; options?: string },
  SerializedLexicalNode
>;

export class ImageNode extends DecoratorNode<Component> {
  __id: string;
  __border: boolean;
  __width: number;
  __name: string;
  __options?: string;

  static getType(): string {
    return 'image';
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(
      node.__id,
      node.__border,
      node.__width,
      node.__name,
      node.__options,
      node.__key
    );
  }

  static importJSON(serializedNode: SerializedImageNode): ImageNode {
    const { id, border, width, name, options } = serializedNode;
    const node = $createImageNode({ id, border, width, name, options }).updateFromJSON(
      serializedNode
    );
    return node;
  }

  updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedImageNode>): this {
    const node = super.updateFromJSON(serializedNode);
    node.setId(serializedNode.id);
    node.setBorder(serializedNode.border);
    node.setWidth(serializedNode.width);
    node.setName(serializedNode.name);
    node.setOptions(serializedNode.options || '');
    return node;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('img');
    element.setAttribute('id', this.__id);
    element.setAttribute('alt', this.__name);
    element.setAttribute(WIDTH_DATA_ATTRIBUTE, this.__width.toString());
    element.setAttribute(BORDER_DATA_ATTRIBUTE, this.__border.toString());
    element.setAttribute(OPTIONS_DATA_ATTRIBUTE, this.__options || '');
    return { element };
  }

  static importDOM(): DOMConversionMap | null {
    return { img: () => ({ conversion: $convertImageElement, priority: 0 }) };
  }

  constructor(
    id: string,
    border: boolean,
    width: number,
    name: string,
    options?: string,
    key?: NodeKey
  ) {
    super(key);
    this.__id = id;
    this.__border = border;
    this.__width = width;
    this.__name = name;
    this.__options = options;
  }

  exportJSON(): SerializedImageNode {
    return {
      ...super.exportJSON(),
      id: this.__id,
      border: this.__border,
      width: this.__width,
      name: this.__name,
      options: this.__options,
      type: 'image'
    };
  }

  getBorder(): boolean {
    return this.getLatest().__border;
  }
  getId(): string {
    return this.getLatest().__id;
  }
  getName(): string {
    return this.getLatest().__name;
  }
  getOptions(): string | undefined {
    return this.getLatest().__options;
  }
  getWidth(): number {
    return this.getLatest().__width;
  }

  setBorder(border: boolean): void {
    const writable = this.getWritable();
    writable.__border = border;
  }
  setWidth(width: number): void {
    const writable = this.getWritable();
    writable.__width = width;
  }
  setOptions(options: string): void {
    const writable = this.getWritable();
    writable.__options = options;
  }
  setName(name: string): void {
    const writable = this.getWritable();
    writable.__name = name;
  }
  setId(id: string): void {
    const writable = this.getWritable();
    writable.__id = id;
  }
  // View

  createDOM(config: EditorConfig): HTMLElement {
    const img = document.createElement('span');
    const theme = config.theme;
    const className = theme.image;
    if (className !== undefined) {
      img.className = className;
    }
    return img;
  }

  updateDOM(): false {
    return false;
  }

  decorate(): Component {
    return h(ImageComponent, {
      nodeKey: this.__key,
      id: this.__id,
      border: this.__border,
      width: this.__width,
      options: this.__options
    });
  }
}

export function $createImageNode({
  id,
  border,
  width,
  name,
  options,
  key
}: ImagePayload): ImageNode {
  return $applyNodeReplacement(new ImageNode(id, border, width, name, options, key));
}

export function $isImageNode(node: LexicalNode | null | undefined): node is ImageNode {
  return node instanceof ImageNode;
}
