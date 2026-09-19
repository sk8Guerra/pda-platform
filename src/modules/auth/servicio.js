'use strict';

const bcrypt = require('bcryptjs');
const repositorio = require('./repositorio');
const { emitirToken } = require('../../core/seguridad');
const { noAutorizado, noEncontrado, ErrorAplicacion } = require('../../core/errores');

/**
 * Reglas de autenticacion.
 *
 * Las contrasenas se comparan siempre contra el hash almacenado; la plataforma
 * nunca guarda ni transmite la contrasena en texto plano (RNF-016).
 */

const iniciarSesion = async (correo, contrasena) => {
  if (!correo || !contrasena) {
    throw new ErrorAplicacion('Correo y contrasena son obligatorios', 400, 'DATOS_INCOMPLETOS');
  }

  const usuario = await repositorio.buscarUsuarioPorCorreo(correo);
  if (!usuario) throw noAutorizado();

  const coincide = await bcrypt.compare(contrasena, usuario.contrasena_hash);
  if (!coincide) throw noAutorizado();

  if (usuario.estado !== 'Activo') {
    throw noAutorizado('La cuenta se encuentra inactiva o suspendida');
  }

  await repositorio.registrarAuditoria(
    usuario.id_usuario,
    'inicio_sesion',
    'usuario',
    usuario.id_usuario,
    'Inicio de sesion exitoso'
  );

  return {
    token: emitirToken(usuario),
    usuario: {
      id: usuario.id_usuario,
      nombre: usuario.nombre_completo,
      correo: usuario.correo_electronico,
      rol: usuario.nombre_rol,
    },
  };
};

const obtenerPerfil = async (idUsuario) => {
  const usuario = await repositorio.buscarUsuarioPorId(idUsuario);
  if (!usuario) throw noEncontrado('Usuario');
  return usuario;
};

const listarUsuarios = (limite) => repositorio.listarUsuarios(limite);

module.exports = { iniciarSesion, obtenerPerfil, listarUsuarios };
