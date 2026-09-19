'use strict';

const repositorio = require('./repositorio');
const pasarela = require('./pasarela');
const db = require('../../core/db');
const { ErrorAplicacion, noEncontrado, conflicto } = require('../../core/errores');

/**
 * Reglas de pagos y mensualidades.
 *
 * El pago de una mensualidad ocurre en tres pasos que deben resolverse como una
 * sola unidad: autorizacion en la pasarela, registro del pago con su comprobante
 * y actualizacion del estado de la mensualidad. Si la autorizacion falla, el pago
 * queda registrado como rechazado y la mensualidad permanece pendiente.
 */

const MEDIOS_VALIDOS = ['Tarjeta', 'Transferencia', 'Efectivo'];

const listarMensualidades = (idAlumna, estado) => {
  if (!idAlumna) {
    throw new ErrorAplicacion('Se requiere el identificador de la alumna', 400, 'DATOS_INCOMPLETOS');
  }
  return repositorio.listarMensualidades(idAlumna, estado);
};

const pagarMensualidad = async ({
  idMensualidad,
  idUsuario,
  medioPago,
  tokenTarjeta,
  idUsuarioRegistro,
}) => {
  if (!idMensualidad || !idUsuario) {
    throw new ErrorAplicacion('Se requieren la mensualidad y el usuario que paga', 400, 'DATOS_INCOMPLETOS');
  }
  if (!MEDIOS_VALIDOS.includes(medioPago)) {
    throw new ErrorAplicacion(
      `El medio de pago debe ser uno de: ${MEDIOS_VALIDOS.join(', ')}`,
      422,
      'MEDIO_NO_VALIDO'
    );
  }

  return db.transaccion(async (cliente) => {
    const mensualidad = await repositorio.buscarMensualidad(cliente, idMensualidad);
    if (!mensualidad) throw noEncontrado('Mensualidad');
    if (mensualidad.estado === 'Pagada') throw conflicto('La mensualidad ya fue saldada');

    let autorizacion = { aprobado: true, referenciaPasarela: null };
    if (medioPago === 'Tarjeta') {
      autorizacion = await pasarela.autorizar({
        tokenTarjeta,
        monto: Number(mensualidad.monto),
        referencia: `mensualidad-${idMensualidad}`,
      });
    }

    const pago = await repositorio.crearPago(cliente, {
      idUsuario,
      concepto: `Mensualidad ${idMensualidad}`,
      monto: mensualidad.monto,
      medioPago,
      referenciaPasarela: autorizacion.referenciaPasarela,
      estadoTransaccion: autorizacion.aprobado ? 'Aprobado' : 'Rechazado',
      idUsuarioRegistro: idUsuarioRegistro || null,
    });

    if (!autorizacion.aprobado) {
      return { pago, mensualidad, comprobante: null, aprobado: false };
    }

    const comprobante = await repositorio.crearComprobante(cliente, pago.id_pago);
    const saldada = await repositorio.saldarMensualidad(cliente, idMensualidad, pago.id_pago);

    return { pago, mensualidad: saldada, comprobante, aprobado: true };
  }, idUsuario);
};

const obtenerPago = async (idPago) => {
  const pago = await repositorio.buscarPago(idPago);
  if (!pago) throw noEncontrado('Pago');
  return pago;
};

module.exports = { listarMensualidades, pagarMensualidad, obtenerPago, MEDIOS_VALIDOS };
