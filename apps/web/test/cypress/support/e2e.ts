// ***********************************************************
// This example support/index.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands';

// Public test endpoint; Cypress 16 exposes public configuration separately from secrets.
Cypress.on('window:before:load', (win) => {
  const apiUrl = Cypress.expose('apiUrl');
  if (apiUrl) {
    Object.defineProperty(win, 'AMCUI_API', { value: apiUrl, writable: false });
  }
});

// Alternatively you can use CommonJS syntax:
// require('./commands')
