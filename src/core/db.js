'use strict';

const { Pool, types } = require('pg');
const config = require('./config');
const logger = require('./logger');

// Las columnas DATE se devuelven tal cual las guarda el motor ("2016-03-14") y
// no como un objeto de fecha ajustado a la zona horaria del proceso. Sin esto,
// una fecha de nacimiento puede retroceder un dia al serializarse y alterar el
// calculo de edad en los limites del rango de cada disciplina.
types.setTypeParser(types.builtins.DATE, (valor) => valor);

/**
 * Pool unico de conexiones a PostgreSQL compartido por todos los modulos.
 *
 * La bitacora de auditoria (RNF-018) depende de que cada transaccion declare el
 * usuario responsable mediante set_config('app.current_user_id', ...), por lo que
 * la funcion transaccion() recibe ese identificador y lo establece al inicio.
 */

let pool = null;

const obtenerPool = () => {
  if (!pool) {
    pool = new Pool(config.postgres);
    pool.on('error', (err) => logger.error('Error inesperado en el pool de PostgreSQL', {
      detalle: err.message,
    }));
  }
  return pool;
};

const consultar = (texto, parametros = []) => obtenerPool().query(texto, parametros);

const transaccion = async (trabajo, idUsuario = null) => {
  const cliente = await obtenerPool().connect();
  try {
    await cliente.query('BEGIN');
    if (idUsuario !== null) {
      await cliente.query("SELECT set_config('app.current_user_id', $1, false)", [String(idUsuario)]);
    }
    const resultado = await trabajo(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
};

const verificarConexion = async () => {
  const { rows } = await consultar('SELECT 1 AS ok');
  return rows[0].ok === 1;
};

const cerrar = async () => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};

module.exports = { consultar, transaccion, verificarConexion, cerrar, obtenerPool };
