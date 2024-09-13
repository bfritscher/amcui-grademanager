/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { EditorThemeClasses } from 'lexical';

import './EditorTheme.css';

const theme: EditorThemeClasses = {
  blockCursor: 'le__blockCursor',
  characterLimit: 'le__characterLimit',
  code: 'le__code',
  codeHighlight: {
    atrule: 'le__tokenAttr',
    attr: 'le__tokenAttr',
    boolean: 'le__tokenProperty',
    builtin: 'le__tokenSelector',
    cdata: 'le__tokenComment',
    char: 'le__tokenSelector',
    class: 'le__tokenFunction',
    'class-name': 'le__tokenFunction',
    comment: 'le__tokenComment',
    constant: 'le__tokenProperty',
    deleted: 'le__tokenProperty',
    doctype: 'le__tokenComment',
    entity: 'le__tokenOperator',
    function: 'le__tokenFunction',
    important: 'le__tokenVariable',
    inserted: 'le__tokenSelector',
    keyword: 'le__tokenAttr',
    namespace: 'le__tokenVariable',
    number: 'le__tokenProperty',
    operator: 'le__tokenOperator',
    prolog: 'le__tokenComment',
    property: 'le__tokenProperty',
    punctuation: 'le__tokenPunctuation',
    regex: 'le__tokenVariable',
    selector: 'le__tokenSelector',
    string: 'le__tokenSelector',
    symbol: 'le__tokenProperty',
    tag: 'le__tokenProperty',
    url: 'le__tokenOperator',
    variable: 'le__tokenVariable'
  },
  embedBlock: {
    base: 'le__embedBlock',
    focus: 'le__embedBlockFocus'
  },
  hashtag: 'le__hashtag',
  heading: {
    h1: 'le__h1',
    h2: 'le__h2',
    h3: 'le__h3',
    h4: 'le__h4',
    h5: 'le__h5',
    h6: 'le__h6'
  },
  hr: 'le__hr',
  image: 'editor-image',
  indent: 'le__indent',
  inlineImage: 'inline-editor-image',
  layoutContainer: 'le__layoutContainer',
  layoutItem: 'le__layoutItem',
  link: 'le__link',
  list: {
    checklist: 'le__checklist',
    listitem: 'le__listItem',
    listitemChecked: 'le__listItemChecked',
    listitemUnchecked: 'le__listItemUnchecked',
    nested: {
      listitem: 'le__nestedListItem'
    },
    olDepth: ['le__ol1', 'le__ol2', 'le__ol3', 'le__ol4', 'le__ol5'],
    ul: 'le__ul'
  },
  ltr: 'le__ltr',
  mark: 'le__mark',
  markOverlap: 'le__markOverlap',
  paragraph: 'le__paragraph',
  quote: 'le__quote',
  rtl: 'le__rtl',
  table: 'le__table',
  tableAddColumns: 'le__tableAddColumns',
  tableAddRows: 'le__tableAddRows',
  tableCell: 'le__tableCell',
  tableCellActionButton: 'le__tableCellActionButton',
  tableCellActionButtonContainer: 'le__tableCellActionButtonContainer',
  tableCellEditing: 'le__tableCellEditing',
  tableCellHeader: 'le__tableCellHeader',
  tableCellPrimarySelected: 'le__tableCellPrimarySelected',
  tableCellResizer: 'le__tableCellResizer',
  tableCellSelected: 'le__tableCellSelected',
  tableCellSortedIndicator: 'le__tableCellSortedIndicator',
  tableResizeRuler: 'le__tableCellResizeRuler',
  tableSelected: 'le__tableSelected',
  tableSelection: 'le__tableSelection',
  text: {
    bold: 'le__textBold',
    code: 'le__textCode',
    italic: 'le__textItalic',
    strikethrough: 'le__textStrikethrough',
    subscript: 'le__textSubscript',
    superscript: 'le__textSuperscript',
    underline: 'le__textUnderline',
    underlineStrikethrough: 'le__textUnderlineStrikethrough'
  }
};

export default theme;
