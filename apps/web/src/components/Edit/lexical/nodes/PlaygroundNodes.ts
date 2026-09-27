import { TextNode, type Klass, type LexicalNode, type LexicalNodeReplacement } from 'lexical';
import { HeadingNode } from '@lexical/rich-text';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { ListItemNode, ListNode } from '@lexical/list';
import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { HorizontalRuleNode } from './LexicalHorizontalRuleNode';
import { PageBreakNode } from './PageBreakNode';
import { BoxNode } from './BoxNode';
import { ImageNode } from './ImageNode';
import { CustomCodeNode } from './CustomCodeNode';
import { CustomTextNode } from './CustomTextNode';

const PlaygroundNodes: Array<Klass<LexicalNode> | LexicalNodeReplacement> = [
  CustomTextNode,
  {
    replace: TextNode,
    with: (node: TextNode) => new CustomTextNode(node.__text),
    withKlass: CustomTextNode
  },
  HeadingNode,
  ListNode,
  ListItemNode,
  CustomCodeNode,
  {
    replace: CodeNode,
    with: (node: CodeNode) => new CustomCodeNode(node.__language, undefined, true, false),
    withKlass: CustomCodeNode
  },
  CodeHighlightNode,
  TableNode,
  TableCellNode,
  TableRowNode,
  HorizontalRuleNode,
  PageBreakNode,
  BoxNode,
  ImageNode
];

export default PlaygroundNodes;
