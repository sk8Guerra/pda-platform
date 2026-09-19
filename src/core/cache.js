'use strict';

const { createClient } = require('redis');
const config = require('./config');
const logger = require('./logger');

/**
 * Cliente Redis compartido. Cumple dos funciones en la plataforma:
 *
 *  1. Cache de lectura del catalogo academico, que cambia pocas veces al ano y
 *     se consulta en cada visita (RNF-010: cien usuarios concurrentes).
 *  2. Bloqueo temporal del cupo de una clase mientras se completa el registro de
 *     una alumna, evitando que dos procesos simultaneos ocupen el mismo espacio
 *     (RF-014: el cupo esta limitado por el espacio fisico del local).
 */

let cliente = null;
let disponible = false;

const conectar = async () => {
  if (cliente) return cliente;
  cliente = createClient({
    socket: { host: config.redis.host, port: config.redis.port },
    password: config.redis.password,
  });
  cliente.on('error', (err) => {
    disponible = false;
    logger.warn('Redis no disponible, se continua sin cache', { detalle: err.message });
  });
  cliente.on('ready', () => {
    disponible = true;
  });
  await cliente.connect();
  return cliente;
};

/** Lectura tolerante a fallos: si Redis no responde, se resuelve como ausencia. */
const obtener = async (llave) => {
  if (!disponible || !cliente) return null;
  try {
    const valor = await cliente.get(llave);
    return valor ? JSON.parse(valor) : null;
  } catch (err) {
    logger.warn('Fallo la lectura de cache', { llave, detalle: err.message });
    return null;
  }
};

const guardar = async (llave, valor, ttl = config.redis.ttlCache) => {
  if (!disponible || !cliente) return false;
  try {
    await cliente.set(llave, JSON.stringify(valor), { EX: ttl });
    return true;
  } catch (err) {
    logger.warn('Fallo la escritura en cache', { llave, detalle: err.message });
    return false;
  }
};

const invalidar = async (patron) => {
  if (!disponible || !cliente) return 0;
  const llaves = await cliente.keys(patron);
  if (llaves.length === 0) return 0;
  await cliente.del(llaves);
  return llaves.length;
};

/**
 * Bloqueo distribuido con expiracion. Devuelve true solo si el bloqueo se obtuvo.
 * Si Redis no esta disponible se concede el bloqueo para no detener la operacion:
 * la restriccion definitiva de cupo la impone la base de datos.
 */
const bloquear = async (llave, ttl = config.redis.ttlBloqueoCupo) => {
  if (!disponible || !cliente) return true;
  const resultado = await cliente.set(`bloqueo:${llave}`, '1', { NX: true, EX: ttl });
  return resultado === 'OK';
};

const liberar = async (llave) => {
  if (!disponible || !cliente) return;
  await cliente.del(`bloqueo:${llave}`);
};

const verificarConexion = async () => {
  if (!cliente) return false;
  const respuesta = await cliente.ping();
  return respuesta === 'PONG';
};

const cerrar = async () => {
  if (cliente) {
    await cliente.quit();
    cliente = null;
    disponible = false;
  }
};

module.exports = {
  conectar,
  obtener,
  guardar,
  invalidar,
  bloquear,
  liberar,
  verificarConexion,
  cerrar,
  estaDisponible: () => disponible,
};
