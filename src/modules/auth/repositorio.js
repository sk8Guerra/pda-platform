'use strict';

const db = require('../../core/db');

/** Acceso a datos del modulo de identidad (Modulo 1 del diccionario de datos). */

const buscarUsuarioPorCorreo = async (correo) => {
  const { rows } = await db.consultar(
    `SELECT u.id_usuario, u.nombre_completo, u.correo_electronico, u.contrasena_hash,
            u.estado, r.nombre_rol
       FROM usuario u
       JOIN rol r ON r.id_rol = u.id_rol
      WHERE lower(u.correo_electronico) = lower($1)`,
    [correo]
  );
  return rows[0] || null;
};

const buscarUsuarioPorId = async (idUsuario) => {
  const { rows } = await db.consultar(
    `SELECT u.id_usuario, u.nombre_completo, u.correo_electronico, u.telefono,
            u.estado, u.fecha_registro, r.nombre_rol
       FROM usuario u
       JOIN rol r ON r.id_rol = u.id_rol
      WHERE u.id_usuario = $1`,
    [idUsuario]
  );
  return rows[0] || null;
};

const listarUsuarios = async (limite = 50) => {
  const { rows } = await db.consultar(
    `SELECT u.id_usuario, u.nombre_completo, u.correo_electronico, u.estado, r.nombre_rol
       FROM usuario u
       JOIN rol r ON r.id_rol = u.id_rol
      ORDER BY u.id_usuario
      LIMIT $1`,
    [limite]
  );
  return rows;
};

const registrarAuditoria = (idUsuario, accion, entidad, idEntidad, detalle) =>
  db.consultar(
    `INSERT INTO bitacora_auditoria
       (id_usuario, accion, entidad_afectada, id_entidad_afectada, fecha_hora, detalle)
     VALUES ($1, $2, $3, $4, now(), $5)`,
    [idUsuario, accion, entidad, idEntidad, detalle]
  );

module.exports = {
  buscarUsuarioPorCorreo,
  buscarUsuarioPorId,
  listarUsuarios,
  registrarAuditoria,
};
