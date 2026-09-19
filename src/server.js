'use strict';

const config = require('./core/config');
const logger = require('./core/logger');
const cache = require('./core/cache');
const db = require('./core/db');
const { crearApp } = require('./core/app');

/**
 * Punto de entrada unico.
 *
 * La variable de entorno SERVICE decide que se levanta:
 *   SERVICE=monolito     -> los cuatro modulos en un solo proceso
 *   SERVICE=inscripcion  -> unicamente el modulo de inscripcion y registro
 *
 * Es el mismo binario y la misma imagen base en ambos casos, lo que permite
 * probar en desarrollo como monolito y desplegar por servicios sin bifurcar el
 * codigo fuente.
 */

const arrancar = async () => {
  try {
    await cache.conectar();
  } catch (err) {
    logger.warn('No se pudo conectar a Redis en el arranque', { detalle: err.message });
  }

  const app = crearApp(config.servicio);

  const servidor = app.listen(config.puerto, () => {
    logger.info('servicio iniciado', {
      servicio: config.servicio,
      puerto: config.puerto,
      entorno: config.entorno,
    });
  });

  const apagar = async (senal) => {
    logger.info('apagado ordenado', { senal });
    servidor.close(async () => {
      await Promise.allSettled([db.cerrar(), cache.cerrar()]);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => apagar('SIGTERM'));
  process.on('SIGINT', () => apagar('SIGINT'));
};

if (require.main === module) {
  arrancar();
}

module.exports = { arrancar };
