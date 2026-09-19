'use strict';

require('dotenv').config();

/**
 * Configuracion central de la plataforma.
 *
 * Toda la configuracion proviene de variables de entorno, de modo que una misma
 * imagen de contenedor pueda desplegarse en desarrollo, pruebas y produccion sin
 * recompilarse (principio de configuracion externa, DevOps).
 */

const entero = (valor, porDefecto) => {
  const n = Number.parseInt(valor, 10);
  return Number.isNaN(n) ? porDefecto : n;
};

const SERVICIOS_VALIDOS = ['monolito', 'auth', 'catalogo', 'inscripcion', 'pagos'];

const servicio = (process.env.SERVICE || 'monolito').toLowerCase();

if (!SERVICIOS_VALIDOS.includes(servicio)) {
  throw new Error(
    `SERVICE="${servicio}" no es valido. Valores permitidos: ${SERVICIOS_VALIDOS.join(', ')}`
  );
}

const config = {
  servicio,
  serviciosValidos: SERVICIOS_VALIDOS,
  entorno: process.env.NODE_ENV || 'development',
  puerto: entero(process.env.PORT, 3000),
  nivelLog: process.env.LOG_LEVEL || 'info',

  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: entero(process.env.POSTGRES_PORT, 5432),
    database: process.env.POSTGRES_DB || 'pda',
    user: process.env.POSTGRES_USER || 'pda_app',
    password: process.env.POSTGRES_PASSWORD || '',
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: entero(process.env.POSTGRES_POOL_MAX, 10),
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: entero(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    ttlCache: entero(process.env.CACHE_TTL_SEGUNDOS, 60),
    ttlBloqueoCupo: entero(process.env.BLOQUEO_CUPO_SEGUNDOS, 300),
  },

  seguridad: {
    jwtSecret: process.env.JWT_SECRET || 'secreto-de-desarrollo-no-usar-en-produccion',
    jwtExpiracion: process.env.JWT_EXPIRACION || '30m',
    bcryptRounds: entero(process.env.BCRYPT_ROUNDS, 12),
    corsOrigenes: (process.env.CORS_ORIGENES || '*').split(',').map((o) => o.trim()),
  },

  pasarela: {
    url: process.env.PASARELA_URL || '',
    apiKey: process.env.PASARELA_API_KEY || '',
    comercioId: process.env.PASARELA_COMERCIO_ID || '',
  },
};

module.exports = config;
