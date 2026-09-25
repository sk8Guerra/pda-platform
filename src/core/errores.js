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

/**
 * Fallos que levanta express.json antes de que la peticion llegue a un modulo.
 * Traen su causa en la propiedad "type" y son defectos de la peticion, no del
 * servidor, de modo que no deben responderse como error interno.
 */
const ERRORES_DE_CUERPO = {
  'entity.too.large': [413, 'CUERPO_DEMASIADO_GRANDE', 'El cuerpo de la peticion supera el limite permitido'],
  'entity.parse.failed': [400, 'JSON_INVALIDO', 'El cuerpo de la peticion no es JSON valido'],
  'encoding.unsupported': [415, 'CODIFICACION_NO_SOPORTADA', 'La codificacion del cuerpo no esta soportada'],
};

/** Middleware final de Express: traduce cualquier error a una respuesta JSON. */
const manejadorDeErrores = (err, req, res, _next) => {
  const deCuerpo = ERRORES_DE_CUERPO[err.type];
  const estado = err.estado || (deCuerpo && deCuerpo[0]) || 500;

  if (estado >= 500) {
    logger.error('Error no controlado', { ruta: req.originalUrl, detalle: err.message });
  }

  res.status(estado).json({
    error: {
      codigo: err.codigo || (deCuerpo && deCuerpo[1]) || 'ERROR_INTERNO',
      mensaje: estado >= 500
        ? 'Error interno del servidor'
        : (deCuerpo ? deCuerpo[2] : err.message),
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
