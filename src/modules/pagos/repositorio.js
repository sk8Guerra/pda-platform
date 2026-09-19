'use strict';

const db = require('../../core/db');

/** Acceso a datos de pagos y mensualidades (Modulo 4 del diccionario de datos). */

const listarMensualidades = async (idAlumna, estado = null) => {
  const { rows } = await db.consultar(
    `SELECT m.id_mensualidad, m.id_alumna, m.id_disciplina, d.nombre AS disciplina,
            m.periodo_mes, m.periodo_anio, m.monto, m.fecha_limite_pago, m.estado, m.id_pago
       FROM mensualidad m
       JOIN disciplina d ON d.id_disciplina = m.id_disciplina
      WHERE m.id_alumna = $1
        AND ($2::varchar IS NULL OR m.estado = $2)
      ORDER BY m.periodo_anio DESC, m.periodo_mes DESC`,
    [idAlumna, estado]
  );
  return rows;
};

const buscarMensualidad = (cliente, idMensualidad) =>
  cliente.query(
    `SELECT id_mensualidad, id_alumna, monto, estado, id_pago
       FROM mensualidad
      WHERE id_mensualidad = $1
      FOR UPDATE`,
    [idMensualidad]
  ).then((r) => r.rows[0] || null);

const crearPago = (cliente, datos) =>
  cliente.query(
    `INSERT INTO pago
       (id_usuario, concepto, monto_total, medio_pago, referencia_pasarela,
        estado_transaccion, fecha_pago, id_usuario_registro)
     VALUES ($1, $2, $3, $4, $5, $6, now(), $7)
     RETURNING id_pago, concepto, monto_total, medio_pago, estado_transaccion, fecha_pago`,
    [
      datos.idUsuario,
      datos.concepto,
      datos.monto,
      datos.medioPago,
      datos.referenciaPasarela,
      datos.estadoTransaccion,
      datos.idUsuarioRegistro,
    ]
  ).then((r) => r.rows[0]);

const saldarMensualidad = (cliente, idMensualidad, idPago) =>
  cliente.query(
    `UPDATE mensualidad SET estado = 'Pagada', id_pago = $2
      WHERE id_mensualidad = $1
      RETURNING id_mensualidad, estado, id_pago`,
    [idMensualidad, idPago]
  ).then((r) => r.rows[0]);

// El identificador se declara una sola vez con tipo explicito y se reutiliza
// desde una subconsulta: si se pasara $1 tres veces con distintos moldes,
// PostgreSQL no logra deducir un tipo consistente para el parametro.
const crearComprobante = (cliente, idPago) =>
  cliente.query(
    `INSERT INTO comprobante_pago (id_pago, numero_correlativo, fecha_emision, url_pdf)
     SELECT p.id,
            'PDA-' || lpad(p.id::text, 8, '0'),
            now(),
            '/comprobantes/' || p.id::text || '.pdf'
       FROM (SELECT $1::int AS id) AS p
     RETURNING id_comprobante, numero_correlativo, url_pdf`,
    [idPago]
  ).then((r) => r.rows[0]);

const buscarPago = async (idPago) => {
  const { rows } = await db.consultar(
    `SELECT p.id_pago, p.id_usuario, p.concepto, p.monto_total, p.medio_pago,
            p.referencia_pasarela, p.estado_transaccion, p.fecha_pago,
            c.numero_correlativo, c.url_pdf
       FROM pago p
       LEFT JOIN comprobante_pago c ON c.id_pago = p.id_pago
      WHERE p.id_pago = $1`,
    [idPago]
  );
  return rows[0] || null;
};

module.exports = {
  listarMensualidades,
  buscarMensualidad,
  crearPago,
  saldarMensualidad,
  crearComprobante,
  buscarPago,
};
