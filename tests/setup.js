'use strict';

// Entorno determinista para la ejecucion de pruebas, tanto local como en el
// pipeline de integracion continua. Ninguna prueba depende de servicios
// externos: PostgreSQL y Redis se sustituyen por dobles.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.JWT_SECRET = 'secreto-exclusivo-de-pruebas';
process.env.JWT_EXPIRACION = '5m';
process.env.BCRYPT_ROUNDS = '4';
