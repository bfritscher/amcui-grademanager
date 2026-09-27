const API_END_POINT = '';
const PROJECT_NAME = 'ci-test-project';

before(() => {
  //cy.intercept("GET", "/project/list", []).as("getProjects");
  //cy.intercept("POST", "/project/create", []).as("createProject");
  cy.visit(`${API_END_POINT}/`);
  cy.get('input[aria-label="Username"]').type('ci-test-user');
  cy.get('input[aria-label="Password"]').type('test');
  cy.contains('button', 'Login').click();
  cy.contains('Create Project').should('be.visible');
  cy.getLocalStorage('jwtToken').should('not.be.empty');
  cy.saveLocalStorage();
});

function createProject() {
  cy.visit(`${API_END_POINT}/`);
  cy.get('input[aria-label="Project name"]').type(PROJECT_NAME);
  cy.contains('Create Project').click();
  cy.contains(PROJECT_NAME).should('exist');
}

function destroyProject() {
  cy.visit(`${API_END_POINT}/${PROJECT_NAME}/options`);
  cy.contains('Delete project!').click();
  cy.contains('Confirm project deletion!').should('be.visible');
  cy.contains('Delete everything!').click();
  cy.contains('Create Project').should('be.visible');
}

describe('AMCUI Project', { testIsolation: false }, () => {
  beforeEach(() => {
    cy.restoreLocalStorage();
  });

  it('can create project', createProject);
  it('shows error if project exists', () => {
    cy.visit(`${API_END_POINT}/`);
    cy.contains('Project name').parent().find('input').type(PROJECT_NAME);
    cy.contains('Create Project').click();
    cy.contains('Project already exists!').should('exist');
  });

  it('can delete project', destroyProject);
  after(() => {
    cy.restoreLocalStorage();
    createProject();
  });
});

describe('AMCUI Exam Section', { testIsolation: false }, () => {
  beforeEach(() => {
    cy.restoreLocalStorage();
  });

  it('can rename section', () => {
    cy.visit(`${API_END_POINT}/${PROJECT_NAME}/edit`);
    cy.get('input[placeholder="Section Name"]').clear().type('Test Section 1');
    cy.contains('Test Section 1').should('exist');
  });

  it('can add section', () => {
    cy.visit(`${API_END_POINT}/${PROJECT_NAME}/edit`);
    cy.contains('Add Section').click();

    cy.wait(300);
    cy.get('input[placeholder="Section Name"]').clear().type('Test Section 2');
    cy.contains('Test Section 2').should('exist');
    cy.contains('Add Section').click();

    cy.wait(300);
    cy.get('input[placeholder="Section Name"]').clear().type('Test Section 3');
    cy.contains('Test Section 3').should('exist');
  });
  it('can switch section', () => {
    cy.visit(`${API_END_POINT}/${PROJECT_NAME}/edit`);
    cy.contains('a', 'Test Section 2').click();
    cy.contains('a', 'Test Section 3').click();
    cy.contains('a', 'Test Section 2').click();
    cy.contains('a', 'Test Section 1').click();
  });
  it('can switch section through nav menu', () => {
    cy.visit(`${API_END_POINT}/${PROJECT_NAME}/edit`);
    // cy.get('button[aria-label="toggle menu"]').click();
    cy.contains('.edit-drawer-tree a', 'Test Section 2').click();

    cy.wait(300);
    cy.get('input[placeholder="Section Name"]').should('have.value', 'Test Section 2');
    cy.contains('.edit-drawer-tree a', 'Test Section 3').click();

    cy.wait(300);
    cy.get('input[placeholder="Section Name"]').should('have.value', 'Test Section 3');
  });

  /*
  it('can switch dnd section through nav menu', () => {
    cy.visit(`${API_END_POINT}/${PROJECT_NAME}/edit`);
    // cy.get('button[aria-label="toggle menu"]').click();

    cy.get('li .sym_o_drag_pan').first().move({ deltaX: 10, deltaY: 200 });
    cy.contains('3 Test Section 1').should('exist');
    cy.contains('Add Section').should('be.visible');
  });
  */
  it('can delete section', () => {
    cy.visit(`${API_END_POINT}/${PROJECT_NAME}/edit/section/1`);
    cy.get('button[aria-label="delete section"]').click();
    cy.get('input[placeholder="Section Name"]').should('have.value', 'Test Section 1');

    cy.wait(300);
    cy.get('button[aria-label="delete section"]').click();

    cy.wait(300);
    cy.get('button[aria-label="delete section"]').click();
    cy.get('input[placeholder="Section Name"]').should('have.value', 'Section Name');
  });
});

describe('AMCUI Exam Question', { testIsolation: false }, () => {
  beforeEach(() => {
    cy.restoreLocalStorage();
    cy.visit(`${API_END_POINT}/${PROJECT_NAME}/edit`);
  });

  it('can add a question', () => {
    cy.contains('Add Question').click();
    cy.get('#q1').should('exist');
  });

  it('can delete a question', () => {
    cy.get('button[aria-label="delete question"]').last().click();
    cy.get('#q1').should('not.exist');
  });

  it('check answer single mode', () => {
    // single mode only allows 1 choice
    cy.contains('Add Question').click();
    cy.get('.question .q-icon.text-warning').should('be.visible');
    cy.get('.answer-toggle[aria-label="incorrect"]').first().click().should('have.attr', 'aria-label', 'correct');
    cy.get('.question .q-icon.text-warning').should('not.exist');
    cy.get('.answer-toggle[aria-label="incorrect"]').last().click().should('have.attr', 'aria-label', 'correct');
    cy.get('.question .q-icon.text-warning').should('be.visible');
    cy.get('button[aria-label="delete question"]').last().click();
  });

  it('can switch to multiple and toggle answers', () => {
    cy.contains('Add Question').click();
    cy.contains('SINGLE').click();
    cy.contains('MULTIPLE').click();
    cy.get('.answer-toggle').last().should('have.attr', 'aria-label', 'correct');
    cy.get('.answer-toggle[aria-label="incorrect"]').first().click().should('have.attr', 'aria-label', 'correct');
    cy.get('.answer-toggle').last().should('have.attr', 'aria-label', 'incorrect');
    cy.get('.question .q-icon.text-warning').should('not.exist');
    cy.contains('.question', '♣').should('exist');
    cy.get('button[aria-label="delete question"]').last().click();
  });

  it('can switch to open and toggle dots and lines', () => {
    cy.contains('Add Question').click();
    cy.contains('SINGLE').click();
    cy.contains('OPEN').click();
    cy.get('[aria-label="Dots"]').click();
    cy.contains('label', 'lines').find('input').clear().type('6');
    cy.get('.dots').should('have.length', 6);
    cy.get('button[aria-label="delete question"]').last().click();
  });

  it('can add answer', () => {
    cy.contains('Add Question').click();
    cy.get('button[aria-label="add new answer"]').first().click();
    cy.get('button[aria-label="add new answer"]').first().click();
    cy.get('.answer').should('have.length', 4);
  });

  it('can delete an answer', () => {
    cy.get('button[aria-label="delete answer"]').first().click();
    cy.get('button[aria-label="delete answer"]').first().click();
    cy.get('button[aria-label="delete answer"]').first().click();
    // TODO should check right is deleted
    cy.get('.answer').should('have.length', 1);
  });

  it('can edit answer content', () => {
    cy.get('.answer .lexical-editor .preview').last().click();
    cy.get('.answer').last().contains('Enter some text...').should('exist');
    cy.get('.answer').last().find('.le__paragraph').type('Test Answer 1');
    cy.get('.answer').last().click();
    cy.contains('Test Answer 1').should('exist');
    cy.wait(1300);
  });

  it('can duplicate a question', () => {
    cy.get('button[aria-label="copy question"]').last().click();
    cy.get('.question').first().should('contain', 'Test Answer 1');
    cy.get('.question').last().should('contain', 'Test Answer 1');
    cy.get('button[aria-label="delete question"]').last().click();
    cy.get('button[aria-label="delete question"]').last().click();
  });

  it('can edit question content', () => {
    cy.contains('Add Question').click();
    cy.get('.question .lexical-editor .preview').last().click();
    cy.get('.question').last().find('.le__paragraph').type('Test Question 1');
    cy.get('.question').last().click();
    cy.contains('Test Question 1').should('exist');

    cy.contains('Add Question').click();
    cy.get('.question .lexical-editor .preview').last().click();
    cy.get('.question').last().find('.le__paragraph').type('Test Question 2');
    cy.get('.question').last().click();
    cy.contains('Test Question 2').should('exist');

    cy.contains('Add Question').click();
    cy.get('.question .lexical-editor .preview').last().click();
    cy.get('.question').last().find('.le__paragraph').type('Test Question 3');
    cy.get('.question').last().click();
    cy.contains('Test Question 3').should('exist');
  });

  /*

  it('can dnd question order', () => {
    //cy.get('button[aria-label="toggle menu"]').click();

    cy.get('li.question-menu .sym_o_drag_pan')
      .first()
      .trigger('pointerdown', { button: 0, force: true })
      .trigger('pointermove', {
        button: 0,
        clientX: 100,
        clientY: 100,
        force: true,
      })
      .wait(500)
      .trigger('pointermove', {
        button: 0,
        clientX: 300,
        clientY: 400,
        force: true,
      })
      .wait(500)
      .trigger('pointerup', { force: true });

    cy.wait(500);
    cy.get('li.question-menu').first().should('contain', 'Test Question 2');
  });

  */

  /*

  it('can dnd question to other section', () => {

    cy.wait(300);
    cy.get('button[aria-label="add section"]').click();

    cy.wait(300);
    cy.get('button[aria-label="add section"]').click();

    cy.wait(300);
    cy.get('button[aria-label="add section"]').click();

    cy.wait(300);
    // cy.get('button[aria-label="toggle menu"]').click();

    cy.get('li.question-menu .sym_o_drag_pan')
      .first()
      .trigger('pointerdown', { button: 0, force: true })
      .trigger('pointermove', {
        button: 0,
        clientX: 200,
        clientY: 100,
        force: true,
      })
      .wait(500)
      .trigger('pointermove', {
        button: 0,
        clientX: 200,
        clientY: 300,
        force: true,
      })
      .wait(500)
      .trigger('pointermove', {
        button: 0,
        clientX: 200,
        clientY: 400,
        force: true,
      })
      .trigger('pointerup', { button: 0, force: true })
      .wait(500);
    cy.get('li.question-menu')
      .last()
      .parent()
      .closest('li')
      .contains('3 Add Section')
      .should('exist');
  });

  */
  /* TODO
    it("can scroll to a question by url", () => {

    });

    it("can scroll to a question by nav menu", () => {

    });
*/
});
after(() => {
  cy.restoreLocalStorage();
  // cleanup because backend keeps data if new project recreated with same name (cache bug)
  cy.get('button[aria-label="delete section"]').click({ force: true });

  cy.wait(300);
  cy.get('button[aria-label="delete section"]').click({ force: true });

  cy.wait(300);
  cy.get('button[aria-label="delete section"]').click({ force: true });

  cy.wait(300);
  cy.get('button[aria-label="delete section"]').click({ force: true });
  destroyProject();
  cy.clearLocalStorage()
  cy.clearCookies()
});
// todo unit test html2latex component
// copy mode
// search
// latex option
// preview dialog
// print dialog
// show print result
// export moodle
// document properties dialog
// select project template
