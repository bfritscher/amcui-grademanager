<template>
  <div class="myrichtexteditor">
    <div
      ref="toolbar"
      class="toolbar hide row no-wrap shadow-1 items-center q-pa-sm scroll"
    >
      <a data-wysihtml5-command="bold" title="CTRL+B"
        ><q-icon name="mdi-format-bold"></q-icon
      ></a>
      <a data-wysihtml5-command="italic" title="CTRL+I"
        ><q-icon name="mdi-format-italic"></q-icon
      ></a>
      <a
        data-wysihtml5-command="formatInline"
        title="Monospace CTRL+M"
        data-wysihtml5-command-value="tt"
        ><q-icon name="mdi-format-text"></q-icon
      ></a>
      <a
        data-wysihtml5-command="formatInline"
        title="Latex Source not escaped CTRL+L"
        data-wysihtml5-command-value="var"
        >LaTeX</a
      >

      <a href="javascript:;" @mousedown.prevent="showStyle = !showStyle"
        ><q-icon name="mdi-format-size"></q-icon
      ></a>
      <div v-if="showStyle" class="toolbar-menu column">
        <a
          data-wysihtml5-command="formatBlock"
          data-wysihtml5-command-value="p"
          title="p"
          @click.stop="
            cmd('formatBlock', 'p');
            showStyle = false;
          "
          ><q-icon name="mdi-format-paragraph"></q-icon
        ></a>
        <a
          data-wysihtml5-command="formatBlock"
          data-wysihtml5-command-value="h1"
          title="h1"
          @click.stop="
            cmd('formatBlock', 'h1');
            showStyle = false;
          "
          ><q-icon name="mdi-format-header-1"></q-icon
        ></a>
        <a
          data-wysihtml5-command="formatBlock"
          data-wysihtml5-command-value="h2"
          title="h2"
          @click.stop="
            cmd('formatBlock', 'h2');
            showStyle = false;
          "
          ><q-icon name="mdi-format-header-2"></q-icon
        ></a>
        <a
          data-wysihtml5-command="formatBlock"
          data-wysihtml5-command-value="h3"
          title="h3"
          @click.stop="
            cmd('formatBlock', 'h3');
            showStyle = false;
          "
          ><q-icon name="mdi-format-header-3"></q-icon
        ></a>
      </div>
      <a data-wysihtml5-command="insertUnorderedList"
        ><q-icon name="mdi-format-list-bulleted"></q-icon
      ></a>
      <a data-wysihtml5-command="insertOrderedList"
        ><q-icon name="mdi-format-list-numbered"></q-icon
      ></a>
      <a data-wysihtml5-command="justifyCenter"
        ><q-icon name="mdi-format-align-center"></q-icon
      ></a>
      <a href="javascript:;" @mousedown.prevent="showGraphicsManager()"
        ><q-icon name="mdi-image"></q-icon
      ></a>
      <a
        data-wysihtml5-command="insertCode"
        data-wysihtml5-command-value='<div class="code"></div>'
        ><q-icon name="mdi-xml"></q-icon
      ></a>
      <a
        data-wysihtml5-command="formatBlock"
        data-wysihtml5-command-value="box"
        title="frame box"
        ><q-icon name="mdi-checkbox-blank-outline"></q-icon
      ></a>
      <a data-wysihtml5-action="change_view" title="toggle html source"
        >switch view</a
      >
      <q-space />
      <a href="javascript:;" title="close edit" @mousedown.prevent="close()"
        ><q-icon name="mdi-close"></q-icon
      ></a>
    </div>
    <textarea ref="textarea" v-model.lazy="content" class="hide"></textarea>
    <!-- eslint-disable vue/no-v-html -->
    <div
      v-if="showPreview"
      ref="preview"
      class="preview"
      @click="initEditor()"
      v-html="content"
    ></div>
    <!-- eslint-enable -->
    <div
      ref="graphicsToolbar"
      class="graphics-toolbar hide row no-wrap items-stretch gutter text-grey-9"
      @mousedown.prevent.stop=""
    >
      <template v-if="graphics">
        <q-checkbox
          v-model="graphics.border"
          type="checkbox"
          label="Border"
          @mousedown.prevent.stop=""
        />
        <template v-if="!graphics.options">
          <button
            aria-label="narrower"
            @mousedown.prevent.stop="
              graphics.width =
                graphics.width > 0.1
                  ? parseFloat((graphics.width - 0.1).toFixed(1))
                  : graphics.width
            "
          >
            <q-icon name="mdi-minus" class="text-grey-9" />
          </button>
          <div class="row items-center">
            <span>{{ graphics.width * 100 }}% </span>
          </div>
          <button
            aria-label="wider"
            @mousedown.prevent.stop="
              graphics.width = parseFloat((graphics.width + 0.1).toFixed(1))
            "
          >
            <q-icon name="mdi-plus" class="text-grey-9" />
          </button>
        </template>
        <div
          v-if="graphics.options"
          class="text-negative row items-center"
          @mousedown.prevent.stop="showGraphicsSettings(graphics)"
        >
          <span>{{ graphics.options }}</span>
        </div>
        <button
          aria-label="options"
          @click.prevent.stop="showGraphicsSettings(graphics)"
        >
          <q-icon name="settings" class="text-grey-9" />
        </button>
        <q-space />
        <button aria-label="close" @click.prevent.stop="closeGraphicsToolbar()">
          <q-icon name="mdi-close" class="text-grey-9" />
        </button>
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, watch } from 'vue';
import CodeMirror from 'codemirror';
import wysihtml5 from 'wysihtml5';
import { v4 as uuidv4 } from 'uuid';
import { Graphics } from '../models';
import CodeEditorDialog from './CodeEditorDialog.vue';
import GraphicsManagerDialog from './GraphicsManagerDialog.vue';

/*
const wysihtml5ParserRules = {
*/
/**
 * CSS Class white-list
 * Following css classes won't be removed when parsed by the wysihtml5 html parser
 */
/*
"classes": {

},
*/
/**
 * Tag list
 *
 * Following options are available:
 *
 *    - add_class:        converts and deletes the given HTML4 attribute (align, clear, ...) via the given method to a css class
 *                        The following methods are implemented in wysihtml5.dom.parse:
 *                          - align_text:  converts align attribute values (right/left/center/justify) to their corresponding css class "wysiwyg-text-align-*")
                              <p align="center">foo</p> ... becomes ... <p> class="wysiwyg-text-align-center">foo</p>
 *                          - clear_br:    converts clear attribute values left/right/all/both to their corresponding css class "wysiwyg-clear-*"
 *                            <br clear="all"> ... becomes ... <br class="wysiwyg-clear-both">
 *                          - align_img:    converts align attribute values (right/left) on <img> to their corresponding css class "wysiwyg-float-*"
 *
 *    - remove:             removes the element and it's content
 *
 *    - rename_tag:         renames the element to the given tag
 *
 *    - set_class:          adds the given class to the element (note: make sure that the class is in the "classes" white list above)
 *
 *    - set_attributes:     sets/overrides the given attributes
 *
 *    - check_attributes:   checks the given HTML attribute via the given method
 *                            - url:      checks whether the given string is an url, deletes the attribute if not
 *                            - alt:      strips unwanted characters. if the attribute is not set, then it gets set (to ensure valid and compatible HTML)
 *                            - numbers:  ensures that the attribute only contains numeric characters
 */
/*
"tags": {

}
};
*/

const wysihtml5ParserRules = {
  classes: {
    'wysiwyg-text-align-center': 1,
  },
  tags: {
    b: {},
    h1: {},
    h2: {},
    h3: {},
    strong: { rename_tag: 'b' },
    i: {},
    em: { rename_tag: 'i' },
    hr: {},
    ul: {},
    ol: {},
    li: {},
    p: {},
    tt: {},
    box: {},
    code: {
      check_attributes: {
        id: 'any',
      },
    },
    span: {},
    var: {},
    img: {
      check_attributes: {
        id: 'any',
      },
    },
    comment: { remove: 1 },
    style: { remove: 1 },
  },
};

// patch wysihtml5 with additional commands
(function (wysihtml5) {
  'use strict';
  wysihtml5.commands.insertCode = {
    exec(composer: any, command: string, html: string) {
      html = '<code id="code' + uuidv4() + '"></code>';
      command = 'insertHTML';
      if (composer.commands.support(command)) {
        composer.doc.execCommand(command, false, html);
      } else {
        composer.selection.insertHTML(html);
      }
    },
    state: function () {
      return false;
    },
  };
})(wysihtml5);

const shortcuts = {
  KeyM: ['formatInline', 'tt'],
  KeyL: ['formatInline', 'var'],
} as { [key: string]: string[] };

function myParse(elementOrHtml_current: string, config: any) {
  // replace empty tags
  elementOrHtml_current = elementOrHtml_current.replace(/<b>\s*<\/b>/g, '');
  elementOrHtml_current = elementOrHtml_current.replace(/<i>\s*<\/i>/g, '');
  elementOrHtml_current = elementOrHtml_current.replace(/<tt>\s*<\/tt>/g, '');
  elementOrHtml_current = elementOrHtml_current.replace(/<var>\s*<\/var>/g, '');
  elementOrHtml_current = elementOrHtml_current.replace(
    /(<code.*?>).*?(<\/code>)/g,
    '$1$2'
  );
  //fix no line return allowed in latex
  const div = document.createElement('div');
  div.innerHTML = elementOrHtml_current;
  let list = div.getElementsByTagName('B');
  let i;
  for (i = 0; i < list.length; i++) {
    list[i].innerHTML = list[i].innerHTML.replace(/\r?\n/g, ' ');
  }
  list = div.getElementsByTagName('I');
  for (i = 0; i < list.length; i++) {
    list[i].innerHTML = list[i].innerHTML.replace(/\r?\n/g, ' ');
  }
  list = div.getElementsByTagName('TT');
  for (i = 0; i < list.length; i++) {
    list[i].innerHTML = list[i].innerHTML.replace(/\r?\n/g, ' ');
  }
  return wysihtml5.dom.parse(div.innerHTML, config);
}

function findParentCode(
  element: HTMLElement | undefined
): HTMLElement | undefined {
  if (element && element.tagName === 'CODE') {
    return element;
  }
  if (element && element.parentElement) {
    return findParentCode(element.parentElement);
  }
  return undefined;
}

export default defineComponent({
  name: 'MyRichTextEditor',
  inject: ['examService'],
  props: {
    modelValue: {
      type: String,
      default: '',
    },
  },
  emits: ['update:modelValue'],
  data() {
    return {
      showStyle: false,
      content: this.modelValue,
      editor: null as any,
      currentImg: null as HTMLElement | null,
      showPreview: true,
      watchers: {} as any,
    };
  },
  computed: {
    graphics(): Graphics | undefined {
      if (!this.currentImg) return;
      return this.examService.getGraphics(this.currentImg.getAttribute('id'));
    },
  },
  watch: {
    modelValue() {
      if (this.modelValue === this.content) return;
      this.content = this.modelValue;
      if (this.editor) {
        this.editor.setValue(this.content);
      }
      setTimeout(() => {
        this.decorate();
      });
    },
  },
  mounted() {
    this.decorate();
  },
  methods: {
    watchImg(img: any) {
      this.watchers[img.id] = watch(
        () => this.examService.exam.graphics[img.id],
        () => {
          this.decorate();
          if (this.currentImg) {
            (this.$refs.graphicsToolbar as HTMLElement).style.width =
              this.currentImg.offsetWidth + 'px';
          }
        },
        {
          deep: true,
        }
      );
    },
    watchCode(code: any) {
      this.watchers[code.id] = watch(
        () => this.examService.exam.codes[code.id],
        () => {
          this.decorate();
        },
        {
          deep: true,
        }
      );
    },
    initEditor() {
      const graphicsToolbar = this.$refs.graphicsToolbar as HTMLElement;
      const toolbar = this.$refs.toolbar as HTMLElement;
      const textarea = this.$refs.textarea as HTMLElement;

      this.editor = new wysihtml5.Editor(this.$refs.textarea, {
        autoLink: false,
        toolbar: toolbar,
        parserRules: wysihtml5ParserRules,
        parser: myParse,
        contentEditableMode: true,
        useLineBreaks: false,
        stylesheets: ['styles/wysihtml5_custom.css'],
      });
      const editor = this.editor;

      // add shortcuts
      wysihtml5.dom.observe(
        editor.composer.editableArea,
        'keydown',
        (event: KeyboardEvent) => {
          const command = shortcuts[event.code];
          if ((event.ctrlKey || event.metaKey) && !event.altKey && command) {
            editor.composer.commands.exec.apply(
              editor.composer.commands,
              command
            );
            event.preventDefault();
          }
        }
      );

      setTimeout(() => {
        editor.composer.editableArea.addEventListener(
          'click',
          (event: MouseEvent) => {
            const imgElement = event.target as HTMLElement;
            if (imgElement && imgElement.tagName === 'IMG') {
              graphicsToolbar.classList.remove('hide');
              graphicsToolbar.style.top = imgElement.offsetTop + 'px';
              graphicsToolbar.style.left = imgElement.offsetLeft + 'px';
              graphicsToolbar.style.width = imgElement.offsetWidth + 'px';
              this.currentImg = imgElement;
            }

            const codeElement = findParentCode(imgElement);
            if (codeElement) {
              const code = this.examService.getCode(
                codeElement.getAttribute('id')
              );
              if (code) {
                this.$q.dialog({
                  component: CodeEditorDialog,
                  componentProps: {
                    codeId: code.id,
                  },
                  persistent: true,
                });
              }
            }
          }
        );
      });

      editor.on('focus', () => {
        toolbar.classList.remove('hide');
        toolbar.classList.toggle(
          'scrollfix',
          toolbar.scrollWidth > toolbar.clientWidth
        );
      });

      editor.on('blur', () => {
        toolbar.classList.add('hide');
        graphicsToolbar.classList.add('hide');
      });

      // Sync view -> model
      editor.on('change', () => {
        this.content = editor.getValue(true);
        this.$emit('update:modelValue', this.content);
      });

      editor.on('paste', () => {
        setTimeout(() => {
          this.decorate();
        });
      });

      editor.on('aftercommand:composer', () => {
        setTimeout(() => {
          this.decorate();
        });
      });

      editor.on('change_view', () => {
        setTimeout(() => {
          this.decorate();
        });
      });

      toolbar.classList.remove('hide');
      textarea.classList.remove('hide');
      toolbar.classList.toggle(
        'scrollfix',
        toolbar.scrollWidth > toolbar.clientWidth
      );

      //remove preview since we now have the editor
      this.showPreview = false;

      setTimeout(() => {
        editor.focus();
      });
    },
    decorate(): void {
      let element = this.$refs.preview as HTMLElement;
      if (this.editor) {
        element = this.editor.composer.editableArea;
      }
      const imgs = element.getElementsByTagName('img');
      for (let i = 0; i < imgs.length; i++) {
        const imgElement = imgs[i];
        const img = this.examService.getGraphics(imgElement.getAttribute('id'));
        if (img) {
          if (!this.watchers.hasOwnProperty(img.id)) {
            this.watchImg(img);
          }
          imgElement.setAttribute(
            'src',
            this.examService.graphicsPreviewURL(img.id)
          );
          imgElement.classList.toggle('border', img.border);
          imgElement.classList.toggle('options', !!img.options);
          imgElement.style.width = img.width * 100 + '%';
        } else {
          imgElement.setAttribute(
            'src',
            this.examService.graphicsPreviewURL('')
          );
        }
      }

      const codes = element.getElementsByTagName('code');
      for (let c = 0; c < codes.length; c++) {
        const codeElement = codes[c];
        codeElement.classList.add('wysihtml5-uneditable-container');
        const code = this.examService.getCode(
          codeElement.getAttribute('id'),
          true
        );
        if (code) {
          codeElement.classList.toggle('border', code.border);
          let cm;
          if (codeElement.children.length === 0) {
            cm = CodeMirror(codeElement, {
              viewportMargin: Infinity,
              value: code.content || '\n',
              lineNumbers: code.numbers,
              mode: code.mode,
              readOnly: 'nocursor',
            });
            if (!this.watchers.hasOwnProperty(code.id)) {
              this.watchCode(code);
            }
          } else {
            cm = (codeElement.children[0] as any).CodeMirror;
            cm.setOption('lineNumbers', code.numbers);
            cm.setOption('mode', code.mode);
            cm.setValue(code.content);
          }
        }
      }
    },
    showGraphicsManager() {
      this.$q
        .dialog({
          component: GraphicsManagerDialog,
        })
        .onOk((item: Graphics) => {
          if (item) {
            wysihtml5.commands.insertImage.exec(
              this.editor.composer,
              'insertImage',
              {
                id: item.id,
              }
            );
            setTimeout(() => {
              this.decorate();
            });
          }
        });
    },
    close() {
      if (this.editor) {
        this.editor.currentView.element.blur();
      }
    },
    cmd(name: string, value: string) {
      if (this.editor) {
        this.editor.composer.commands.exec(name, value);
      }
    },
    closeGraphicsToolbar() {
      (this.$refs.graphicsToolbar as HTMLElement).classList.add('hide');
    },
    showGraphicsSettings(graphics: Graphics) {
      this.$q
        .dialog({
          title: 'Advanced options',
          message:
            'Provide LaTeX includegraphics options overrides: width=\textwidth',
          cancel: true,
          ok: 'save',
          prompt: {
            model: graphics.options || '',
            type: 'text',
            label: 'options',
          },
        })
        .onOk((options: string) => {
          if (this.graphics) {
            this.graphics.options = options;
          }
        });
    },
  },
});
</script>

<style>
.myrichtexteditor {
  position: relative;
}

.myrichtexteditor .toolbar {
  margin-bottom: 8px;
  position: absolute;
  top: -50px;
  left: 8px;
  right: 8px;
  background-color: #fff;
  z-index: 999;
}

.myrichtexteditor .toolbar.scrollfix {
  top: -80px;
}

.myrichtexteditor .toolbar a {
  padding: 2px;
  color: #666666;
  text-decoration: none;
  cursor: pointer;
  border: 1px solid #fff;
  margin-right: 2px;
}
.myrichtexteditor .toolbar a:hover {
  background-color: #e0e0e0;
}
.myrichtexteditor .toolbar .mdi {
  width: 32px;
  height: 32px;
  font-size: 32px;
  line-height: 32px;
}

.myrichtexteditor .toolbar a.wysihtml5-command-active {
  border: 1px solid #000;
  color: #000;
}

.myrichtexteditor .toolbar-menu {
  position: absolute;
  background-color: #fff;
  top: 48px;
  left: 180px;
}
.myrichtexteditor {
  border: 1px solid #eee;
  text-align: justify;
}
.myrichtexteditor .preview {
  min-height: 2em;
}
.myrichtexteditor .hide {
  display: none;
}
.myrichtexteditor var {
  font-family: monospace;
  white-space: pre;
  color: red;
  font-size: 16px;
  display: inline;
}
.myrichtexteditor p {
  margin: 0.3em 0;
  padding: 0;
}
.myrichtexteditor box {
  border: 1px solid #000;
  display: block;
}
.myrichtexteditor tt {
  display: inline;
}
.myrichtexteditor img.border {
  border: 1px solid black;
}
.myrichtexteditor img.options {
  filter: blur(2px) grayscale(80%);
}
.myrichtexteditor textarea {
  width: 100%;
  min-height: 300px;
}
.myrichtexteditor .graphics-toolbar {
  position: absolute;
  background-color: rgba(200, 200, 200, 0.8);
  min-width: 350px;
}
.myrichtexteditor .graphics-toolbar button {
  border: none;
  background-color: transparent;
  cursor: pointer;
  font-size: 1.6em;
}

.myrichtexteditor .CodeMirror {
  height: auto;
}

.myrichtexteditor code.border .CodeMirror {
  border: 1px solid #000;
}
.wysiwyg-text-align-center {
  text-align: center;
}
.myrichtexteditor .wysihtml5-editor,
.myrichtexteditor .preview {
  padding: 8px;
}
</style>
