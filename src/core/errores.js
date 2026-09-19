'use strict';

const logger = require('./logger');

/** Error de negocio con codigo HTTP asociado. */
class ErrorAplicacion extends Error {
  constructor(mensaje, estado = 400, codigo = 'SOLICITUD_INVALIDA') {
    super(mensaje);
    this.name = 'ErrorAplicacion';
    this.estado = estado;
    this.codigo = codigo;
  }
}

const noEncontrado = (recurso) =>
  new ErrorAplicacion(`${recurso} no encontrado`, 404, 'NO_ENCONTRADO');

const noAutorizado = (mensaje = 'Credenciales invalidas') =>
  new ErrorAplicacion(mensaje, 401, 'NO_AUTORIZADO');

const prohibido = (mensaje = 'No cuenta con permisos para esta operacion') =>
  new ErrorAplicacion(mensaje, 403, 'PROHIBIDO');

const conflicto = (mensaje) => new ErrorAplicacion(mensaje, 409, 'CONFLICTO');

/** Middleware final de Express: traduce cualquier error a una respuesta JSON. */
const manejadorDeErrores = (err, req, res, _next) => {
  const estado = err.estado || 500;
  if (estado >= 500) {
    logger.error('Error no controlado', { ruta: req.originalUrl, detalle: err.message });
  }
  res.status(estado).json({
    error: {
      codigo: err.codigo || 'ERROR_INTERNO',
      mensaje: estado >= 500 ? 'Error interno del servidor' : err.message,
    },
  });
};

/** Envuelve un controlador asincrono para que sus rechazos lleguen al manejador. */
const asincrono = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  ErrorAplicacion,
  noEncontrado,
  noAutorizado,
  prohibido,
  conflicto,
  manejadorDeErrores,
  asincrono,
};
