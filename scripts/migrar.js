'use strict';

/* ===========================================================================
   Aplicacion del esquema y de los datos semilla sobre una base PostgreSQL.

   El mismo guion sirve para el entorno local y para el de staging en AWS. En
   local, Docker Compose ejecuta los scripts de db/init la primera vez que se
   crea el volumen; en AWS no existe ese mecanismo, de modo que la canalizacion
   ejecuta este guion como una tarea previa al despliegue.

   Es idempotente: si el esquema ya existe no vuelve a aplicarlo. Con la bandera
   --reiniciar borra el esquema y lo recrea desde cero, lo que deja el entorno
   en el estado conocido que exigen las pruebas de aceptacion.

   Uso:
     node scripts/migrar.js              aplica el esquema si aun no existe
     node scripts/migrar.js --reiniciar  borra y recrea el esquema completo
     node scripts/migrar.js --verificar  solo informa el estado, no escribe
   =========================================================================== */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const config = require('../src/core/config');
const cache = require('../src/core/cache');

const RAIZ = path.join(__dirname, '..');
const ESQUEMA = path.join(RAIZ, 'db', 'init', '01_esquema.sql');
const SEMILLA = path.join(RAIZ, 'db', 'init', '02_semilla.sql');

const banderas = process.argv.slice(2);
const reiniciar = banderas.includes('--reiniciar');
const soloVerificar = banderas.includes('--verificar');

const registrar = (mensaje) => process.stdout.write(`[migrar] ${mensaje}\n`);

const dormir = (ms) => new Promise((resolver) => { setTimeout(resolver, ms); });

/**
 * PostgreSQL puede tardar en aceptar conexiones cuando la instancia acaba de
 * arrancar, tanto en el contenedor local como en la instancia de RDS. Se
 * reintenta durante dos minutos antes de dar el intento por perdido.
 */
const conectarConReintentos = async (intentos = 24, esperaMs = 5000) => {
  for (let intento = 1; intento <= intentos; intento += 1) {
    const cliente = new Client({
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      password: config.postgres.password,
      ssl: config.postgres.ssl,
      connectionTimeoutMillis: 10000,
    });
    try {
      await cliente.connect();
      registrar(`conectado a ${config.postgres.host}:${config.postgres.port}/${config.postgres.database}`);
      return cliente;
    } catch (err) {
      await cliente.end().catch(() => {});
      if (intento === intentos) throw err;
      registrar(`intento ${intento} de ${intentos} fallido (${err.message}); se reintenta en ${esperaMs / 1000}s`);
      await dormir(esperaMs);
    }
  }
  throw new Error('inalcanzable');
};

const existeEsquema = async (cliente) => {
  const { rows } = await cliente.query(
    `SELECT to_regclass('public.usuario') IS NOT NULL AS existe`
  );
  return rows[0].existe;
};

const contarFilas = async (cliente, tabla) => {
  const { rows } = await cliente.query(`SELECT count(*)::int AS total FROM ${tabla}`);
  return rows[0].total;
};

/**
 * Vacia la cache del catalogo despues de un reinicio de datos.
 *
 * Sin esto, la plataforma seguiria sirviendo el cupo y las disciplinas que
 * guardo antes del reinicio hasta que venciera su tiempo de vida, y una prueba
 * que acaba de dejar la base en su estado inicial leeria numeros que ya no
 * corresponden. Si Redis no esta disponible no es un fallo: la lectura caeria a
 * PostgreSQL de todas formas.
 */
const vaciarCache = async () => {
  try {
    await cache.conectar();
    registrar(`cache vaciada: ${await cache.invalidar('catalogo:*')} llaves eliminadas`);
  } catch (err) {
    registrar(`no se pudo vaciar la cache (${err.message}); se continua`);
  } finally {
    await cache.cerrar().catch(() => {});
  }
};

const principal = async () => {
  if (reiniciar && config.entorno === 'production' && process.env.PERMITIR_REINICIO !== 'true') {
    throw new Error(
      'Reinicio bloqueado: NODE_ENV es production. Para forzarlo, exportar PERMITIR_REINICIO=true.'
    );
  }

  const cliente = await conectarConReintentos();

  try {
    const yaExiste = await existeEsquema(cliente);

    if (soloVerificar) {
      registrar(yaExiste ? 'el esquema ya esta aplicado' : 'el esquema no esta aplicado');
      if (yaExiste) {
        registrar(`usuarios: ${await contarFilas(cliente, 'usuario')}`);
        registrar(`disciplinas: ${await contarFilas(cliente, 'disciplina')}`);
        registrar(`solicitudes: ${await contarFilas(cliente, 'solicitud_inscripcion')}`);
      }
      return;
    }

    if (yaExiste && !reiniciar) {
      registrar('el esquema ya esta aplicado; no se hace nada (usar --reiniciar para recrearlo)');
      return;
    }

    if (reiniciar) {
      registrar('borrando el esquema public y recreandolo');
      await cliente.query('DROP SCHEMA IF EXISTS public CASCADE');
      await cliente.query('CREATE SCHEMA public');
      await cliente.query(`GRANT ALL ON SCHEMA public TO ${cliente.user}`);
    }

    registrar('aplicando 01_esquema.sql');
    await cliente.query(fs.readFileSync(ESQUEMA, 'utf8'));

    registrar('aplicando 02_semilla.sql');
    await cliente.query(fs.readFileSync(SEMILLA, 'utf8'));

    registrar(`listo: ${await contarFilas(cliente, 'usuario')} usuarios, `
      + `${await contarFilas(cliente, 'disciplina')} disciplinas, `
      + `${await contarFilas(cliente, 'clase')} clases`);

    if (reiniciar) await vaciarCache();
  } finally {
    await cliente.end().catch(() => {});
  }
};

principal().catch((err) => {
  process.stderr.write(`[migrar] ERROR: ${err.message}\n`);
  process.exit(1);
});
