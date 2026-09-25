'use strict';

const { defineConfig, devices } = require('@playwright/test');

/* ===========================================================================
   Configuracion de las pruebas de sistema, aceptacion, seguridad y rendimiento.

   A diferencia de la bateria de Jest, que sustituye PostgreSQL y Redis por
   dobles, estas pruebas se ejecutan contra la plataforma desplegada de verdad:
   contenedores en marcha, base de datos con sus disparadores y cache activa.
   Es la unica forma de comprobar las reglas que viven en el motor.

   El destino se elige con la variable BASE_URL:
     local      BASE_URL=http://localhost:3000   (docker compose, perfil monolito)
     staging    BASE_URL=http://<ip-de-la-tarea>:3000
   =========================================================================== */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

module.exports = defineConfig({
  testDir: './tests/e2e',
  outputDir: './reports/playwright-artefactos',

  // Las pruebas comparten una sola base de datos y varias compiten por el cupo
  // de la misma clase. Se ejecutan en serie para que el resultado no dependa
  // del orden en que el planificador las despache.
  fullyParallel: false,
  workers: 1,

  timeout: 60_000,
  expect: { timeout: 10_000 },

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/playwright', open: 'never' }],
    ['junit', { outputFile: 'reports/playwright-junit.xml' }],
  ],

  use: {
    baseURL: BASE_URL,
    // Las pruebas de aceptacion localizan los elementos por el atributo
    // data-prueba de la consola, no por texto ni por clase de estilo: el
    // redisenio de la pantalla no rompe la bateria.
    testIdAttribute: 'data-prueba',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { Accept: 'application/json' },
  },

  projects: [
    {
      name: 'sistema',
      testMatch: /sistema-.*\.spec\.js/,
    },
    {
      name: 'aceptacion',
      testMatch: /aceptacion-.*\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'seguridad',
      testMatch: /seguridad-.*\.spec\.js/,
    },
    {
      name: 'rendimiento',
      testMatch: /rendimiento-.*\.spec\.js/,
    },
  ],
});
