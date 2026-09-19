'use strict';

const db = require('../../core/db');

/**
 * Acceso a datos del recorrido de inscripcion y registro.
 *
 * El recorrido tiene dos tramos. El primero, la inscripcion, va desde que una
 * persona interesada envia su solicitud hasta que la direccion la acepta o la
 * rechaza. El segundo, el registro, empieza en el momento en que la aspirante es
 * aceptada: entonces se crea su expediente de alumna y se le asigna un horario,
 * una clase y una docente.
 */

const crearSolicitud = (cliente, datos) =>
  cliente.query(
    `INSERT INTO solicitud_inscripcion
       (nombre_aspirante, fecha_nacimiento, id_disciplina, nombre_encargado,
        correo_contacto, telefono_contacto, estado, fecha_solicitud)
     VALUES ($1, $2, $3, $4, $5, $6, 'Recibida', now())
     RETURNING *`,
    [
      datos.nombreAspirante,
      datos.fechaNacimiento,
      datos.idDisciplina,
      datos.nombreEncargado,
      datos.correoContacto,
      datos.telefonoContacto,
    ]
  ).then((r) => r.rows[0]);

const buscarSolicitud = async (idSolicitud) => {
  const { rows } = await db.consultar(
    `SELECT s.*, d.nombre AS disciplina, d.edad_minima, d.edad_maxima, d.monto_mensualidad
       FROM solicitud_inscripcion s
       JOIN disciplina d ON d.id_disciplina = s.id_disciplina
      WHERE s.id_solicitud = $1`,
    [idSolicitud]
  );
  return rows[0] || null;
};

const listarSolicitudes = async (estado = null) => {
  const { rows } = await db.consultar(
    `SELECT s.id_solicitud, s.nombre_aspirante, s.fecha_nacimiento, s.estado,
            s.fecha_solicitud, d.nombre AS disciplina
       FROM solicitud_inscripcion s
       JOIN disciplina d ON d.id_disciplina = s.id_disciplina
      WHERE ($1::varchar IS NULL OR s.estado = $1)
      ORDER BY s.fecha_solicitud DESC`,
    [estado]
  );
  return rows;
};

const cupoConfirmado = (cliente, idClase) =>
  cliente.query(
    `SELECT c.cupo_maximo,
            count(r.id_reserva) FILTER (WHERE r.estado = 'Confirmada')::int AS ocupados
       FROM clase c
       LEFT JOIN reserva_cupo r ON r.id_clase = c.id_clase
      WHERE c.id_clase = $1
      GROUP BY c.cupo_maximo`,
    [idClase]
  ).then((r) => r.rows[0] || null);

const datosDeClase = (cliente, idClase) =>
  cliente.query(
    `SELECT c.id_clase, c.id_disciplina, c.id_nivel, c.id_docente,
            c.dia_semana, c.hora_inicio, c.hora_fin,
            u.nombre_completo AS docente
       FROM clase c
       LEFT JOIN usuario u ON u.id_usuario = c.id_docente
      WHERE c.id_clase = $1`,
    [idClase]
  ).then((r) => r.rows[0] || null);

const crearAlumna = (cliente, solicitud, idUsuarioRegistro) =>
  cliente.query(
    `INSERT INTO alumna
       (nombre_completo, fecha_nacimiento, contacto_emergencia, estado,
        fecha_registro, id_usuario_registro)
     VALUES ($1, $2, $3, 'Activa', now(), $4)
     RETURNING id_alumna, nombre_completo, fecha_nacimiento, estado`,
    [
      solicitud.nombre_aspirante,
      solicitud.fecha_nacimiento,
      `${solicitud.nombre_encargado} ${solicitud.telefono_contacto || ''}`.trim(),
      idUsuarioRegistro,
    ]
  ).then((r) => r.rows[0]);

const asignarDisciplina = (cliente, idAlumna, idDisciplina, idNivel) =>
  cliente.query(
    `INSERT INTO alumna_disciplina (id_alumna, id_disciplina, id_nivel, fecha_inscripcion)
     VALUES ($1, $2, $3, current_date)
     ON CONFLICT (id_alumna, id_disciplina) DO UPDATE SET id_nivel = EXCLUDED.id_nivel
     RETURNING *`,
    [idAlumna, idDisciplina, idNivel]
  ).then((r) => r.rows[0]);

const reservarCupo = (cliente, idAlumna, idClase) =>
  cliente.query(
    `INSERT INTO reserva_cupo (id_alumna, id_clase, fecha_reserva, estado)
     VALUES ($1, $2, now(), 'Confirmada')
     RETURNING id_reserva, id_alumna, id_clase, estado, fecha_reserva`,
    [idAlumna, idClase]
  ).then((r) => r.rows[0]);

const cerrarSolicitud = (cliente, idSolicitud, estado, idAlumna = null) =>
  cliente.query(
    `UPDATE solicitud_inscripcion
        SET estado = $2, id_alumna_generada = $3, fecha_resolucion = now()
      WHERE id_solicitud = $1
      RETURNING *`,
    [idSolicitud, estado, idAlumna]
  ).then((r) => r.rows[0]);

const registrarAuditoria = (cliente, idUsuario, accion, entidad, idEntidad, detalle) =>
  cliente.query(
    `INSERT INTO bitacora_auditoria
       (id_usuario, accion, entidad_afectada, id_entidad_afectada, fecha_hora, detalle)
     VALUES ($1, $2, $3, $4, now(), $5)`,
    [idUsuario, accion, entidad, idEntidad, detalle]
  );

module.exports = {
  crearSolicitud,
  buscarSolicitud,
  listarSolicitudes,
  cupoConfirmado,
  datosDeClase,
  crearAlumna,
  asignarDisciplina,
  reservarCupo,
  cerrarSolicitud,
  registrarAuditoria,
};
