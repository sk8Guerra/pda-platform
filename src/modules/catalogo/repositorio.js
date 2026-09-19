'use strict';

const db = require('../../core/db');

/**
 * Acceso a datos del catalogo academico: la oferta que la academia publica y que
 * una aspirante consulta antes de solicitar su inscripcion (Modulos 2 y 3).
 */

const listarDisciplinas = async () => {
  const { rows } = await db.consultar(
    `SELECT d.id_disciplina, d.nombre, d.descripcion, d.edad_minima, d.edad_maxima,
            d.monto_mensualidad,
            count(n.id_nivel)::int AS total_niveles
       FROM disciplina d
       LEFT JOIN nivel n ON n.id_disciplina = d.id_disciplina
      GROUP BY d.id_disciplina
      ORDER BY d.nombre`
  );
  return rows;
};

const buscarDisciplina = async (idDisciplina) => {
  const { rows } = await db.consultar(
    `SELECT id_disciplina, nombre, descripcion, edad_minima, edad_maxima, monto_mensualidad
       FROM disciplina
      WHERE id_disciplina = $1`,
    [idDisciplina]
  );
  return rows[0] || null;
};

const listarNiveles = async (idDisciplina) => {
  const { rows } = await db.consultar(
    `SELECT id_nivel, id_disciplina, nombre_nivel
       FROM nivel
      WHERE id_disciplina = $1
      ORDER BY id_nivel`,
    [idDisciplina]
  );
  return rows;
};

/**
 * Clases con su cupo disponible calculado. El cupo maximo esta limitado por el
 * espacio fisico del local (RF-014), por lo que la disponibilidad es el dato
 * central que consulta el proceso de registro.
 */
const listarClases = async ({ idDisciplina = null, idNivel = null } = {}) => {
  const { rows } = await db.consultar(
    `SELECT c.id_clase, c.id_disciplina, d.nombre AS disciplina,
            c.id_nivel, n.nombre_nivel AS nivel,
            c.id_docente, u.nombre_completo AS docente,
            c.dia_semana, c.hora_inicio, c.hora_fin, c.cupo_maximo,
            c.cupo_maximo - count(r.id_reserva) FILTER (
              WHERE r.estado = 'Confirmada'
            )::int AS cupo_disponible
       FROM clase c
       JOIN disciplina d ON d.id_disciplina = c.id_disciplina
       JOIN nivel n ON n.id_nivel = c.id_nivel
       LEFT JOIN usuario u ON u.id_usuario = c.id_docente
       LEFT JOIN reserva_cupo r ON r.id_clase = c.id_clase
      WHERE ($1::int IS NULL OR c.id_disciplina = $1)
        AND ($2::int IS NULL OR c.id_nivel = $2)
      GROUP BY c.id_clase, d.nombre, n.nombre_nivel, u.nombre_completo
      ORDER BY d.nombre, c.dia_semana, c.hora_inicio`,
    [idDisciplina, idNivel]
  );
  return rows;
};

const buscarClase = async (idClase) => {
  const clases = await listarClases();
  return clases.find((c) => c.id_clase === Number(idClase)) || null;
};

module.exports = {
  listarDisciplinas,
  buscarDisciplina,
  listarNiveles,
  listarClases,
  buscarClase,
};
