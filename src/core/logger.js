'use strict';

const config = require('./config');

/**
 * Registro estructurado en formato JSON, legible por CloudWatch Logs sin
 * necesidad de reglas de extraccion adicionales.
 */

const NIVELES = { error: 0, warn: 1, info: 2, debug: 3 };

const nivelActual = NIVELES[config.nivelLog] ?? NIVELES.info;

const emitir = (nivel, mensaje, datos = {}) => {
  if (NIVELES[nivel] > nivelActual) return;
  const linea = {
    ts: new Date().toISOString(),
    nivel,
    servicio: config.servicio,
    mensaje,
    ...datos,
  };
  const salida = nivel === 'error' ? process.stderr : process.stdout;
  salida.write(`${JSON.stringify(linea)}\n`);
};

module.exports = {
  error: (mensaje, datos) => emitir('error', mensaje, datos),
  warn: (mensaje, datos) => emitir('warn', mensaje, datos),
  info: (mensaje, datos) => emitir('info', mensaje, datos),
  debug: (mensaje, datos) => emitir('debug', mensaje, datos),
};
