'use strict';

/* ===========================================================================
   Reglas de analisis estatico.

   El conjunto es deliberadamente corto: solo errores que rompen la ejecucion o
   que delatan codigo muerto. El estilo lo fija la revision entre companeros, no
   la herramienta, de modo que una discusion de formato nunca detenga la
   canalizacion. Este paso es la primera puerta de calidad de la etapa de
   construccion (RNF-022).
   =========================================================================== */

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'reports/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },

  // --- Codigo de la plataforma y guiones de apoyo (Node.js) ----------------
  {
    files: ['src/**/*.js', 'scripts/**/*.js', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // --- Consola operativa (navegador) ---------------------------------------
  {
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // --- Pruebas end to end ---------------------------------------------------
  // Corren en Node.js, pero las funciones que se pasan a page.evaluate se
  // ejecutan dentro del navegador: en ese fragmento existe document.
  {
    files: ['tests/e2e/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // --- Baterias de Jest -----------------------------------------------------
  {
    files: ['tests/unitarias/**/*.js', 'tests/integracion/**/*.js', 'tests/seguridad/**/*.js', 'tests/setup.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
