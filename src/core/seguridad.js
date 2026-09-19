'use strict';

const jwt = require('jsonwebtoken');
const config = require('./config');
const { noAutorizado, prohibido } = require('./errores');

/**
 * Emision y verificacion de credenciales de sesion (RNF-020: cierre automatico
 * de sesion por inactividad, implementado como expiracion corta del token).
 */

const emitirToken = (usuario) =>
  jwt.sign(
    { sub: usuario.id_usuario, rol: usuario.nombre_rol, correo: usuario.correo_electronico },
    config.seguridad.jwtSecret,
    { expiresIn: config.seguridad.jwtExpiracion }
  );

const verificarToken = (token) => jwt.verify(token, config.seguridad.jwtSecret);

/** Middleware: exige un token valido en la cabecera Authorization. */
const requiereSesion = (req, _res, next) => {
  const cabecera = req.headers.authorization || '';
  const [esquema, token] = cabecera.split(' ');
  if (esquema !== 'Bearer' || !token) {
    return next(noAutorizado('Se requiere un token de sesion'));
  }
  try {
    req.usuario = verificarToken(token);
    return next();
  } catch (err) {
    const mensaje = err.name === 'TokenExpiredError'
      ? 'La sesion expiro por inactividad'
      : 'Token de sesion invalido';
    return next(noAutorizado(mensaje));
  }
};

/** Middleware: restringe una ruta a determinados roles (RF-001 a RF-006). */
const requiereRol = (...roles) => (req, _res, next) => {
  if (!req.usuario) return next(noAutorizado());
  if (!roles.includes(req.usuario.rol)) return next(prohibido());
  return next();
};

module.exports = { emitirToken, verificarToken, requiereSesion, requiereRol };
