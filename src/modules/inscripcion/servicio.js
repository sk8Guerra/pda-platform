'use strict';

const repositorio = require('./repositorio');
const db = require('../../core/db');
const cache = require('../../core/cache');
const { ErrorAplicacion, noEncontrado, conflicto } = require('../../core/errores');

/**
 * Reglas del recorrido de inscripcion y registro.
 *
 * Tramo 1 (inscripcion): una persona interesada envia una solicitud indicando la
 * disciplina de su interes. La solicitud se valida contra el rango de edad de la
 * disciplina antes de aceptarse.
 *
 * Tramo 2 (registro): al aceptar la solicitud, en una sola transaccion se crea el
 * expediente de la alumna, se le asigna la disciplina con su nivel y se confirma
 * su cupo en una clase concreta, la cual determina su horario y su docente. Si
 * cualquiera de los tres pasos falla, no queda ningun registro parcial.
 */

const calcularEdad = (fechaNacimiento, referencia = new Date()) => {
  const nacimiento = new Date(fechaNacimiento);
  let edad = referencia.getFullYear() - nacimiento.getFullYear();
  const mes = referencia.getMonth() - nacimiento.getMonth();
  if (mes < 0 || (mes === 0 && referencia.getDate() < nacimiento.getDate())) edad -= 1;
  return edad;
};

const validarEdad = (edad, disciplina) => {
  if (disciplina.edad_minima !== null && edad < disciplina.edad_minima) {
    throw new ErrorAplicacion(
      `La edad minima para ${disciplina.disciplina || 'la disciplina'} es ${disciplina.edad_minima} anios`,
      422,
      'EDAD_FUERA_DE_RANGO'
    );
  }
  if (disciplina.edad_maxima !== null && edad > disciplina.edad_maxima) {
    throw new ErrorAplicacion(
      `La edad maxima para ${disciplina.disciplina || 'la disciplina'} es ${disciplina.edad_maxima} anios`,
      422,
      'EDAD_FUERA_DE_RANGO'
    );
  }
};

const CAMPOS_OBLIGATORIOS = [
  ['nombreAspirante', 'el nombre de la aspirante'],
  ['fechaNacimiento', 'la fecha de nacimiento'],
  ['idDisciplina', 'la disciplina de interes'],
  ['nombreEncargado', 'el nombre del encargado'],
];

const crearSolicitud = async (datos = {}) => {
  const faltantes = CAMPOS_OBLIGATORIOS.filter(([campo]) => !datos[campo]).map(([, etiqueta]) => etiqueta);
  if (faltantes.length > 0) {
    throw new ErrorAplicacion(`Faltan datos obligatorios: ${faltantes.join(', ')}`, 400, 'DATOS_INCOMPLETOS');
  }

  return db.transaccion(async (cliente) => {
    const { rows } = await cliente.query(
      `SELECT id_disciplina, nombre AS disciplina, edad_minima, edad_maxima
         FROM disciplina WHERE id_disciplina = $1`,
      [datos.idDisciplina]
    );
    const disciplina = rows[0];
    if (!disciplina) throw noEncontrado('Disciplina');

    validarEdad(calcularEdad(datos.fechaNacimiento), disciplina);

    const solicitud = await repositorio.crearSolicitud(cliente, datos);
    return { solicitud, disciplina: disciplina.disciplina };
  });
};

const obtenerSolicitud = async (idSolicitud) => {
  const solicitud = await repositorio.buscarSolicitud(idSolicitud);
  if (!solicitud) throw noEncontrado('Solicitud de inscripcion');
  return solicitud;
};

const listarSolicitudes = (estado) => repositorio.listarSolicitudes(estado);

/**
 * Acepta la solicitud y ejecuta el registro. Antes de abrir la transaccion se
 * toma un bloqueo en Redis sobre la clase, para que dos aceptaciones simultaneas
 * no ocupen el ultimo espacio disponible. La verificacion definitiva del cupo se
 * hace de todas formas dentro de la transaccion, contra la base de datos.
 */
const aceptarSolicitud = async (idSolicitud, { idClase, idNivel, idUsuarioAutoriza }) => {
  if (!idClase || !idNivel) {
    throw new ErrorAplicacion(
      'Para registrar a la alumna se requiere la clase y el nivel asignados',
      400,
      'DATOS_INCOMPLETOS'
    );
  }

  const bloqueoObtenido = await cache.bloquear(`clase:${idClase}`, 30);
  if (!bloqueoObtenido) {
    throw conflicto('Otro registro esta ocupando un cupo de esta clase en este momento');
  }

  try {
    const resultado = await db.transaccion(async (cliente) => {
      const { rows } = await cliente.query(
        `SELECT s.*, d.nombre AS disciplina, d.edad_minima, d.edad_maxima
           FROM solicitud_inscripcion s
           JOIN disciplina d ON d.id_disciplina = s.id_disciplina
          WHERE s.id_solicitud = $1
          FOR UPDATE OF s`,
        [idSolicitud]
      );
      const solicitud = rows[0];
      if (!solicitud) throw noEncontrado('Solicitud de inscripcion');
      if (solicitud.estado !== 'Recibida') {
        throw conflicto(`La solicitud ya fue resuelta con estado "${solicitud.estado}"`);
      }

      validarEdad(calcularEdad(solicitud.fecha_nacimiento), solicitud);

      const clase = await repositorio.datosDeClase(cliente, idClase);
      if (!clase) throw noEncontrado('Clase');
      if (clase.id_disciplina !== solicitud.id_disciplina) {
        throw new ErrorAplicacion(
          'La clase seleccionada pertenece a otra disciplina',
          422,
          'CLASE_INCOMPATIBLE'
        );
      }

      const cupo = await repositorio.cupoConfirmado(cliente, idClase);
      if (cupo && cupo.ocupados >= cupo.cupo_maximo) {
        throw conflicto('La clase seleccionada ya no tiene cupo disponible');
      }

      const alumna = await repositorio.crearAlumna(cliente, solicitud, idUsuarioAutoriza);
      await repositorio.asignarDisciplina(cliente, alumna.id_alumna, solicitud.id_disciplina, idNivel);
      const reserva = await repositorio.reservarCupo(cliente, alumna.id_alumna, idClase);
      const cerrada = await repositorio.cerrarSolicitud(cliente, idSolicitud, 'Aceptada', alumna.id_alumna);

      await repositorio.registrarAuditoria(
        cliente,
        idUsuarioAutoriza,
        'aceptar_inscripcion',
        'solicitud_inscripcion',
        idSolicitud,
        `Alumna ${alumna.id_alumna} registrada en la clase ${idClase}`
      );

      return {
        solicitud: cerrada,
        alumna,
        asignacion: {
          idClase: clase.id_clase,
          diaSemana: clase.dia_semana,
          horaInicio: clase.hora_inicio,
          horaFin: clase.hora_fin,
          docente: clase.docente,
          idNivel,
          idReserva: reserva.id_reserva,
        },
      };
    }, idUsuarioAutoriza);

    await cache.invalidar('catalogo:clases:*');
    return resultado;
  } finally {
    await cache.liberar(`clase:${idClase}`);
  }
};

const rechazarSolicitud = async (idSolicitud, { motivo, idUsuarioAutoriza }) =>
  db.transaccion(async (cliente) => {
    const solicitud = await repositorio.buscarSolicitud(idSolicitud);
    if (!solicitud) throw noEncontrado('Solicitud de inscripcion');
    if (solicitud.estado !== 'Recibida') {
      throw conflicto(`La solicitud ya fue resuelta con estado "${solicitud.estado}"`);
    }
    const cerrada = await repositorio.cerrarSolicitud(cliente, idSolicitud, 'Rechazada');
    await repositorio.registrarAuditoria(
      cliente,
      idUsuarioAutoriza,
      'rechazar_inscripcion',
      'solicitud_inscripcion',
      idSolicitud,
      motivo || 'Sin motivo registrado'
    );
    return cerrada;
  }, idUsuarioAutoriza);

module.exports = {
  crearSolicitud,
  obtenerSolicitud,
  listarSolicitudes,
  aceptarSolicitud,
  rechazarSolicitud,
  calcularEdad,
  validarEdad,
};
