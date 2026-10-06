// Each case owns a fresh project. No editor internals or mocked persistence:
// toolbar actions go through the browser and reload reads from the real server.
const runId = Date.now().toString(36);
const api = Cypress.expose('apiUrl') || 'http://127.0.0.1:9001';
const editable = '.question [contenteditable="true"]';
const toolbar = '.question .lexical-toolbar';
let token: string;
let project: string;
let sequence = 0;

function button(name: string) {
  return cy.get(`${toolbar} [aria-label="${name}"]`);
}

function insert(name: string) {
  button('Insert specialized editor node').click();
  cy.contains('.q-menu .q-item', name).click();
}

function reloadEditor() {
  cy.reload();
  cy.get('.question .lexical-editor .preview').first().should('be.visible').click();
  cy.get(editable).should('be.visible');
}

describe('Rich-text toolbar workflows', () => {
  before(() => {
    cy.request('POST', `${api}/login`, {
      username: `editor-e2e-${runId}`,
      password: `editor-e2e-${runId}`
    }).then(({ body }) => {
      token = body.token;
    });
  });

  beforeEach(() => {
    project = `editor-e2e-${runId}-${++sequence}`;
    cy.request({
      method: 'POST',
      url: `${api}/project/create`,
      headers: { Authorization: `Bearer ${token}` },
      body: { project }
    });
    cy.visit(`/${project}/edit`, {
      onBeforeLoad(win) {
        win.localStorage.setItem('jwtToken', token);
      }
    });
    cy.contains('Add Question').click();
    cy.get('.question .lexical-editor .preview').first().click();
    cy.get(editable).should('be.visible');
  });

  afterEach(() => {
    // Close the websocket before removing only this case's project.
    cy.visit('/');
    cy.request({
      method: 'POST',
      url: `${api}/project/${project}/delete`,
      headers: { Authorization: `Bearer ${token}` }
    });
  });

  it('formats selected text, undoes/redoes, and retains formatting after a page reload', () => {
    cy.get(editable).type('Persistent formatting{selectAll}');
    button('Format Bold').click();
    cy.get(`${editable} strong`).should('have.text', 'Persistent formatting');
    button('Undo').should('not.be.disabled').click();
    cy.get(`${editable} strong`).should('not.exist');
    button('Redo').should('not.be.disabled').click();
    cy.get(`${editable} strong`).should('have.text', 'Persistent formatting');
    button('Center text alignment').click();
    cy.get(`${editable} p`).should('have.css', 'text-align', 'center');
    reloadEditor();
    cy.get(`${editable} strong`).should('have.text', 'Persistent formatting');
    cy.get(`${editable} p`).should('have.css', 'text-align', 'center');
    // Browser layout checks catch the ContentEditable fragment/scoped-CSS regression.
    cy.get(editable)
      .should('have.css', 'padding-left', '28px')
      .and('have.css', 'outline-style', 'none');
    cy.get(toolbar).should('be.visible');
    cy.get(editable).type('{selectAll}');
    button('Formatting options for additional text styles').click();
    cy.contains('.q-menu .q-item', 'Clear Formatting').click();
    cy.get(`${editable} strong`).should('not.exist');
    reloadEditor();
    cy.get(editable).should('have.text', 'Persistent formatting');
    cy.get(`${editable} strong`).should('not.exist');
  });

  it('inserts a table through the dialog, edits cells, and uses its row/column menu', () => {
    insert('Table');
    cy.contains('.q-dialog label', 'Rows').find('input').clear();
    cy.contains('.q-dialog label', 'Rows').find('input').type('0');
    cy.contains('.q-dialog button', 'Insert').should('be.disabled');
    cy.contains('.q-dialog label', 'Rows').find('input').clear();
    cy.contains('.q-dialog label', 'Rows').find('input').type('2');
    cy.contains('.q-dialog button', 'Insert').click();
    cy.get('.q-dialog').should('not.exist');
    cy.get(`${editable} td`).should('have.length', 4);
    cy.get(`${editable} td p`).first().click('left');
    cy.document().should((doc) => {
      const selection = doc.getSelection();
      const anchor = selection?.anchorNode;
      const element = anchor?.nodeType === 1 ? (anchor as Element) : anchor?.parentElement;
      expect(Boolean(element?.closest('td')), `caret at ${element?.outerHTML}`).to.equal(true);
    });
    cy.get(editable).should('be.focused');
    // Native key events exercise contenteditable inside a table. cy.type's
    // synthetic DOM insertion is not equivalent for empty Lexical cells.
    for (const key of 'Saved cell') cy.press(key);
    cy.get(editable).should(($root) => {
      expect($root.find('td').text(), $root.html()).to.contain('Saved cell');
    });
    cy.get('.table-cell-action-button').click();
    cy.get('[data-test-id="table-insert-row-below"]').click();
    cy.get(`${editable} tr`).should('have.length', 3);
    cy.contains(`${editable} td`, 'Saved cell').click();
    cy.get('.table-cell-action-button').click();
    cy.get('[data-test-id="table-insert-column-after"]').click();
    cy.get(`${editable} td`).should('have.length', 9);
    reloadEditor();
    cy.get(`${editable} td`).should('have.length', 9);
    cy.contains(`${editable} td`, 'Saved cell').click();
    cy.get('.table-cell-action-button').click();
    cy.get('[data-test-id="table-delete"]').click();
    cy.get(`${editable} table`).should('not.exist');
    reloadEditor();
    cy.get(`${editable} table`).should('not.exist');
  });

  it('uploads an image, changes its properties, and selects it again after dragging and reload', () => {
    cy.get(editable).type('Top{enter}{enter}Bottom{moveToStart}{downArrow}');
    button('Insert Image').click();
    cy.intercept('POST', '**/upload/graphics').as('upload');
    cy.get('.graphics-manager input[type="file"]')
      .first()
      .selectFile('../server/tests/e2e/fixtures/test.jpg', { force: true });
    cy.wait('@upload').its('response.statusCode').should('eq', 200);
    cy.contains('.graphics-manager .img-preview', 'test.jpg').click();
    cy.get('.graphics-manager').should('not.exist');
    cy.get(`${editable} img`).click();
    cy.contains(`${toolbar} label`, 'Width %').find('input').clear();
    cy.contains(`${toolbar} label`, 'Width %').find('input').type('30');
    cy.contains(`${toolbar} label`, 'Width %').find('input').blur();
    cy.contains(`${toolbar} .q-checkbox`, 'Border').click();
    cy.get(`${editable} img`).should('have.class', 'border');

    // Exercise the drag handle and DOM drag events, without moving Lexical nodes directly.
    cy.get(`${editable} img`).then(($image) => {
      const rect = $image[0].getBoundingClientRect();
      cy.wrap($image).trigger('mousemove', {
        eventConstructor: 'MouseEvent',
        clientX: rect.left + 5,
        clientY: rect.top + 5
      });
    });
    cy.window().then((win) => {
      const transfer = new win.DataTransfer();
      cy.get('.draggable-block-menu')
        .should('be.visible')
        .trigger('dragstart', { eventConstructor: 'DragEvent', dataTransfer: transfer });
      cy.contains(`${editable} p`, 'Bottom').then(($target) => {
        const rect = $target[0].getBoundingClientRect();
        const event = {
          eventConstructor: 'DragEvent',
          dataTransfer: transfer,
          clientX: rect.left + 10,
          clientY: rect.bottom - 2
        };
        cy.wrap($target).trigger('dragover', event);
        cy.wrap($target).trigger('drop', event);
      });
      cy.get('.draggable-block-menu').trigger('dragend', {
        // Drop hides the handle, but the browser still delivers dragend to its source.
        force: true,
        eventConstructor: 'DragEvent',
        dataTransfer: transfer
      });
    });
    cy.get(`${editable} > p`).last().find('img').should('exist').click();
    cy.contains(`${toolbar} label`, 'Width %').find('input').should('have.value', '30');
    cy.contains(`${toolbar} label`, 'LaTeX Options').find('input').type('angle=90');
    cy.contains(`${toolbar} label`, 'LaTeX Options').find('input').blur();
    reloadEditor();
    cy.get(`${editable} > p`).last().find('img').should('have.class', 'border').click();
    cy.contains(`${toolbar} label`, 'Width %').find('input').should('have.value', '30');
    cy.contains(`${toolbar} label`, 'LaTeX Options').find('input').should('have.value', 'angle=90');
  });

  it('inserts a Mermaid diagram with the print-oriented drawing tools and discards cleanly', () => {
    cy.get(editable).type('Keep this text');
    insert('Excalidraw');
    cy.get('.excalidraw canvas', { timeout: 20000 }).should('exist');
    cy.contains('.excalidraw-dialog button', /^save as$/i).should('not.be.disabled');
    cy.get('.excalidraw-dialog button[title="More tools"]').click();
    cy.contains('.App-toolbar__extra-tools-dropdown button', 'Frame tool').should('not.be.visible');
    cy.contains('.App-toolbar__extra-tools-dropdown button', 'Web Embed').should('not.be.visible');
    cy.contains('.App-toolbar__extra-tools-dropdown button', 'Laser pointer').should(
      'not.be.visible'
    );
    // Mermaid shares data-testid="toolbar-embeddable" with Web Embed upstream.
    cy.contains('.App-toolbar__extra-tools-dropdown button', 'Mermaid to Excalidraw').click();
    // A normal click/type catches both a portal hidden behind Quasar and its focus trap.
    cy.get('.ttd-dialog textarea').click();
    cy.get('.ttd-dialog textarea').should('be.focused').clear();
    cy.get('.ttd-dialog textarea').type('flowchart LR\n A[Start] --> B[Finish]');
    cy.get('.ttd-dialog canvas', { timeout: 20000 }).should('be.visible');
    cy.contains('.ttd-dialog button', /^Insert$/).click();
    cy.get('.ttd-dialog').should('not.exist');
    cy.get('.excalidraw-dialog button[aria-label="Undo"]').should('not.be.disabled');
    cy.contains('.excalidraw-dialog button', /^discard$/i).click();
    cy.get('.excalidraw-dialog').should('not.exist');
    cy.get(editable).click();
    cy.get(editable).type('{moveToEnd} and continue');
    cy.get(editable).should('have.text', 'Keep this text and continue');
    reloadEditor();
    cy.get(editable).should('have.text', 'Keep this text and continue');
  });
});
