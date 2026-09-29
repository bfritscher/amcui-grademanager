import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { Dialog, Quasar } from 'quasar';
import { $getRoot, getNearestEditorFromDOMNode } from 'lexical';
import LexicalEditor from '../../../src/components/Edit/lexical/LexicalEditor.vue';

vi.mock('@/stores/api', () => ({
  useApiStore: () => ({
    awarenessIndex: {},
    addAwarenessLocation: vi.fn(),
    removeAwarenessLocation: vi.fn()
  })
}));
vi.mock('@/stores/store', async () => {
  const { reactive } = await import('vue');
  return { useStore: () => reactive({ activeEditor: '', tableActionMenuOpen: false }) };
});
vi.mock('@/stores/exam', () => ({
  useExamStore: () => ({
    getGraphics: (id: string) => ({ id, name: `${id}.png`, width: 0.8, border: false }),
    getCode: vi.fn(),
    graphicsPreviewURL: () => '/test.png',
    exam: { graphics: { test: { name: 'test.png' } } }
  })
}));

let wrappers: VueWrapper[];
let errors: ReturnType<typeof vi.spyOn>;
const body = () => new DOMWrapper(document.body);
const label = (name: string) => `[aria-label="${name}"]`;

beforeEach(() => {
  wrappers = [];
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});
afterEach(() => {
  wrappers.forEach((wrapper) => wrapper.unmount());
  document.body.innerHTML = '';
  Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  const calls = [...errors.mock.calls];
  vi.restoreAllMocks();
  // eslint-disable-next-line vitest/no-standalone-expect -- fail every case on editor errors
  expect(calls).toEqual([]);
});

async function open(html = '<p>Selected text</p>') {
  const wrapper = mount(LexicalEditor, {
    props: { modelValue: html },
    attrs: { id: 'controls-test' },
    global: { plugins: [[Quasar, { plugins: { Dialog } }]] },
    attachTo: document.body
  });
  wrappers.push(wrapper);
  await wrapper.get('.preview').trigger('click');
  await flushPromises();
  const root = wrapper.get('[contenteditable]');
  const editor = getNearestEditorFromDOMNode(root.element)!;
  editor.update(
    () => {
      const text = $getRoot().getAllTextNodes()[0];
      if (text) text.select(0, text.getTextContentSize());
      else $getRoot().selectEnd();
    },
    { discrete: true }
  );
  await flushPromises();
  return { wrapper, root, editor };
}

async function click(selector: string) {
  await body().get(selector).trigger('click');
  await flushPromises();
}

async function menuItem(menu: string, text: string) {
  await click(label(menu));
  const item = body()
    .findAll('.q-menu .q-item')
    .find((item) => item.find('.q-item__label').text() === text);
  expect(item, `menu item ${text}`).toBeDefined();
  await item!.trigger('click');
  await flushPromises();
}

function savedHTML(wrapper: VueWrapper) {
  const changes = wrapper.emitted('update:modelValue');
  expect(changes?.length).toBeGreaterThan(0);
  return changes![changes!.length - 1][0] as string;
}

async function reload(wrapper: VueWrapper) {
  const html = savedHTML(wrapper);
  wrapper.unmount();
  wrappers = wrappers.filter((item) => item !== wrapper);
  return open(html);
}

describe('editor toolbar controls and HTML round trips', () => {
  it.each([
    ['Format Bold', 'strong', false],
    ['Format Italics', 'em', false],
    ['Insert Code', 'code', false],
    ['Format text underlined', '.le__textUnderline', true],
    ['Format text with a strikethrough', '.le__textStrikethrough', true],
    ['Format text with a subscript', 'sub', true],
    ['Format text with a superscript', 'sup', true],
    ['Insert Latex', 'mark', true]
  ])('%s applies, survives reload, and toggles off', async (action, tag, dropdown) => {
    let { wrapper, root } = await open();
    const apply = async () => {
      if (dropdown) await click(label('Formatting options for additional text styles'));
      await click(label(action));
    };
    await apply();
    expect(root.get(tag).text()).toBe('Selected text');
    ({ wrapper, root } = await reload(wrapper));
    expect(root.get(tag).text()).toBe('Selected text');
    await apply();
    expect(root.find(tag).exists()).toBe(false);
    expect(root.text()).toBe('Selected text');
  });

  it('centers text, preserves alignment on reload, and toggles back', async () => {
    let { wrapper, root } = await open();
    await click(label('Center text alignment'));
    expect((root.get('p').element as HTMLElement).style.textAlign).toBe('center');
    ({ wrapper, root } = await reload(wrapper));
    expect((root.get('p').element as HTMLElement).style.textAlign).toBe('center');
    await click(label('Center text alignment'));
    expect((root.get('p').element as HTMLElement).style.textAlign).toBe('');
  });

  it('clears text formatting and alignment without losing content', async () => {
    const { wrapper, root } = await open(
      '<p style="text-align:center"><strong><em>Selected text</em></strong></p>'
    );
    await menuItem('Formatting options for additional text styles', 'Clear Formatting');
    expect(root.find('strong, em').exists()).toBe(false);
    expect((root.get('p').element as HTMLElement).style.textAlign).toBe('');
    const reloaded = await reload(wrapper);
    expect(reloaded.root.text()).toBe('Selected text');
    expect(reloaded.root.find('strong, em').exists()).toBe(false);
  });

  it.each([
    ['Heading 1', 'h1'],
    ['Heading 2', 'h2'],
    ['Heading 3', 'h3'],
    ['Bulleted List', 'ul > li'],
    ['Numbered List', 'ol > li'],
    ['Code Block', 'code']
  ])('converts to %s and back to Normal', async (name, selector) => {
    let { wrapper, root } = await open();
    await menuItem('Formatting options for text style', name);
    expect(root.get(selector).text()).toBe('Selected text');
    ({ wrapper, root } = await reload(wrapper));
    expect(root.get(selector).text()).toBe('Selected text');
    await menuItem('Formatting options for text style', 'Normal');
    expect(root.find(selector).exists()).toBe(false);
    expect(root.get('p').text()).toBe('Selected text');
  });

  it('undoes and redoes formatting through the buttons', async () => {
    const { root } = await open();
    await click(label('Format Bold'));
    expect(body().get(label('Undo')).attributes('disabled')).toBeUndefined();
    await click(label('Undo'));
    expect(root.find('strong').exists()).toBe(false);
    expect(body().get(label('Redo')).attributes('disabled')).toBeUndefined();
    await click(label('Redo'));
    expect(root.get('strong').text()).toBe('Selected text');
  });

  it('validates table dimensions and inserts through the actual dialog', async () => {
    const { wrapper, root, editor } = await open();
    editor.update(() => $getRoot().selectEnd(), { discrete: true });
    await menuItem('Insert specialized editor node', 'Table');
    const dialog = body().get('.q-dialog');
    const inputs = dialog.findAll('input[type="number"]');
    const insert = dialog.findAll('button').find((button) => button.text() === 'Insert')!;
    await inputs[0].setValue('0');
    expect(insert.attributes('disabled')).toBeDefined();
    await inputs[0].setValue('501');
    expect(insert.attributes('disabled')).toBeDefined();
    await inputs[0].setValue('3');
    await inputs[1].setValue('51');
    expect(insert.attributes('disabled')).toBeDefined();
    await inputs[1].setValue('2');
    expect(insert.attributes('disabled')).toBeUndefined();
    await insert.trigger('click');
    await flushPromises();
    expect(root.findAll('tr')).toHaveLength(3);
    expect(root.findAll('td')).toHaveLength(6);
    const reloaded = await reload(wrapper);
    expect(reloaded.root.findAll('tr')).toHaveLength(3);
    expect(reloaded.root.findAll('td')).toHaveLength(6);
  });

  it('cancels table insertion without modifying content', async () => {
    const { wrapper, root } = await open();
    const before = wrapper.emitted('update:modelValue')?.length || 0;
    await menuItem('Insert specialized editor node', 'Table');
    const cancel = body()
      .get('.q-dialog')
      .findAll('button')
      .find((button) => button.text() === 'Cancel')!;
    await cancel.trigger('click');
    await flushPromises();
    expect(root.find('table').exists()).toBe(false);
    expect(root.text()).toBe('Selected text');
    expect(wrapper.emitted('update:modelValue')?.length || 0).toBe(before);
  });

  it.each([
    ['table-insert-row-below', 3, 6],
    ['table-insert-column-after', 2, 6],
    ['table-delete-rows', 1, 2],
    ['table-delete-columns', 2, 2],
    ['table-delete', 0, 0]
  ])('table menu %s updates structure and survives reload', async (action, rows, cells) => {
    const { wrapper, root } = await open(
      '<table><tbody><tr><td><p>A</p></td><td><p>B</p></td></tr><tr><td><p>C</p></td><td><p>D</p></td></tr></tbody></table>'
    );
    await click('.table-cell-action-button');
    await click(`[data-test-id="${action}"]`);
    expect(root.findAll('tr')).toHaveLength(rows);
    expect(root.findAll('td')).toHaveLength(cells);
    const reloaded = await reload(wrapper);
    expect(reloaded.root.findAll('tr')).toHaveLength(rows);
    expect(reloaded.root.findAll('td')).toHaveLength(cells);
  });

  it('edits image properties through its contextual toolbar and preserves them on reload', async () => {
    let { wrapper, root } = await open('<p><img id="test" alt="test.png"></p>');
    await root.get('img').trigger('click');
    await flushPromises();
    await click('.lexical-toolbar .q-checkbox');
    await body().get('.lexical-toolbar input[type="number"]').setValue('55');
    await body().get('.lexical-toolbar input[type="text"]').setValue('angle=90');
    await flushPromises();
    const saved = new DOMParser()
      .parseFromString(savedHTML(wrapper), 'text/html')
      .querySelector('img')!;
    expect(saved.getAttribute('data-border')).toBe('true');
    expect(saved.getAttribute('data-width')).toBe('55');
    expect(saved.getAttribute('data-options')).toBe('angle=90');
    ({ wrapper, root } = await reload(wrapper));
    await root.get('img').trigger('click');
    await flushPromises();
    expect(root.get('img').classes()).toContain('border');
    expect(body().get('.lexical-toolbar .q-checkbox').attributes('aria-checked')).toBe('true');
    expect(
      (body().get('.lexical-toolbar input[type="number"]').element as HTMLInputElement).value
    ).toBe('55');
    expect(
      (body().get('.lexical-toolbar input[type="text"]').element as HTMLInputElement).value
    ).toBe('angle=90');
  });

  it('changes code language, line numbers and border through the contextual toolbar', async () => {
    const { wrapper } = await open();
    await menuItem('Formatting options for text style', 'Code Block');
    await menuItem('Select language', 'Python');
    for (const checkbox of body().findAll('.lexical-toolbar .q-checkbox')) {
      await checkbox.trigger('click');
      await flushPromises();
    }
    const { root } = await reload(wrapper);
    const code = root.get('code');
    expect(code.attributes('data-language')).toBe('py');
    expect(code.attributes('data-numbers')).toBe('true');
    expect(code.attributes('data-border')).toBe('false');
    expect(code.text()).toBe('Selected text');
  });

  it.each([
    ['Horizontal Rule', 'hr'],
    ['Box', 'box'],
    ['Page Break', '[type="page-break"]']
  ])('inserts %s from its menu and preserves it on reload', async (name, selector) => {
    const { wrapper, editor } = await open();
    editor.update(() => $getRoot().selectEnd(), { discrete: true });
    await menuItem('Insert specialized editor node', name);
    const saved = new DOMParser().parseFromString(savedHTML(wrapper), 'text/html');
    expect(saved.querySelector(selector)).not.toBeNull();
    const reloaded = await reload(wrapper);
    expect(reloaded.root.text()).toContain('Selected text');
    // Inspect exported HTML again after a real local edit following import.
    reloaded.editor.update(
      () => {
        $getRoot().getAllTextNodes()[0].setTextContent('Edited text').selectEnd();
      },
      { discrete: true }
    );
    await flushPromises();
    expect(
      new DOMParser()
        .parseFromString(savedHTML(reloaded.wrapper), 'text/html')
        .querySelector(selector)
    ).not.toBeNull();
  });
});
