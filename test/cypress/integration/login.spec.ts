describe('AMCUI Login', () => {
  it('show login', () => {
    cy.visit('/');
    cy.contains('Login').should('exist');
  });

  it('can login', () => {
    cy.get('input[aria-label="Username"]').type('ci-test-user');
    cy.get('input[aria-label="Password"]').type('test');
    cy.contains('button', 'Login').click();
    cy.contains('New Project').should('be.visible');
  });

  it('can logout', () => {
    cy.contains('ci-test-user').click();
    cy.contains('Logout').click();
    cy.contains('Login').should('be.visible');
  });
});
