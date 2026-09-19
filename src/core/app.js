'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const config = require('./config');
const logger = require('./logger');
const db = require('./db');
const cache = require('./cache');
const { manejadorDeErrores, asincrono, noEncontrado } = require('./errores');

const MODULOS = {
  auth: require('../modules/auth'),
  catalogo: require('../modules/catalogo'),
  inscripcion: require('../modules/inscripcion'),
  pagos: require('../modules/pagos'),
};

/**
 * Construye la aplicacion Express.
 *
 * El mismo codigo fuente sirve para dos topologias de despliegue:
 *  - SERVICE=monolito  -> monta los cuatro modulos en un solo contenedor.
 *  - SERVICE=<modulo>  -> monta unicamente ese modulo, de modo que cada modulo
 *                          puede desplegarse y escalarse por separado sin
 *                          duplicar ni bifurcar el codigo (RNF-023).
 */
const crearApp = (servicio = config.servicio) => {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.seguridad.corsOrigenes }));
  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, next) => {
    const inicio = Date.now();
    res.on('finish', () => {
      logger.info('peticion', {
        metodo: req.method,
        ruta: req.originalUrl,
        estado: res.statusCode,
        ms: Date.now() - inicio,
      });
    });
    next();
  });

  const activos = servicio === 'monolito' ? Object.keys(MODULOS) : [servicio];

  // Sonda de vida y de dependencias, consumida por Docker, por el balanceador
  // de AWS y por el panel de CloudWatch.
  app.get('/health', asincrono(async (_req, res) => {
    const dependencias = { postgres: 'desconocido', redis: 'desconocido' };
    let estado = 'ok';
    try {
      dependencias.postgres = (await db.verificarConexion()) ? 'ok' : 'error';
    } catch {
      dependencias.postgres = 'error';
      estado = 'degradado';
    }
    try {
      dependencias.redis = (await cache.verificarConexion()) ? 'ok' : 'error';
    } catch {
      dependencias.redis = 'error';
    }
    res.status(estado === 'ok' ? 200 : 503).json({
      estado,
      servicio,
      modulos: activos,
      version: process.env.npm_package_version || '1.0.0',
      dependencias,
      marca: new Date().toISOString(),
    });
  }));

  // Sonda de arranque: no consulta dependencias, responde apenas el proceso vive.
  app.get('/health/vivo', (_req, res) => res.json({ estado: 'ok', servicio }));

  activos.forEach((nombre) => {
    const modulo = MODULOS[nombre];
    app.use(modulo.basePath, modulo.router);
    logger.info('modulo montado', { modulo: nombre, ruta: modulo.basePath });
  });

  app.use((req, _res, next) => next(noEncontrado(`Recurso ${req.originalUrl}`)));
  app.use(manejadorDeErrores);

  return app;
};

module.exports = { crearApp, MODULOS };
