'use strict';

/* ===========================================================================
   Utilidades compartidas por las pruebas de sistema, aceptacion, seguridad y
   rendimiento. Nada de esto toca la aplicacion: son ayudas para preparar datos
   y para leer la respuesta de la API desde las pruebas.
   =========================================================================== */

/**
 * Credenciales del entorno de demostracion, sembradas por db/init/02_semilla.sql.
 * No corresponden a personas reales y solo existen en local y en staging; en un
 * entorno productivo esta semilla no se aplica.
 */
const CREDENCIALES = {
  administrador: { correo: 'direccion@pda.local', contrasena: 'Pda2026*admin' },
  docente: { correo: 'docente@pda.local', contrasena: 'Pda2026*docente' },
  encargado: { correo: 'encargado@pda.local', contrasena: 'Pda2026*encargado' },
};

/** Marca de tiempo corta para que cada ejecucion cree datos propios. */
const marca = () => `${Date.now().toString().slice(-8)}`;

/** Fecha de nacimiento que da la edad pedida el dia de hoy. */
const fechaParaEdad = (anios) => {
  const hoy = new Date();
  const fecha = new Date(hoy.getFullYear() - anios, hoy.getMonth(), hoy.getDate());
  return fecha.toISOString().slice(0, 10);
};

const iniciarSesion = async (peticion, quien = 'administrador') => {
  const respuesta = await peticion.post('/api/auth/login', { data: CREDENCIALES[quien] });
  if (!respuesta.ok()) {
    throw new Error(`No se pudo iniciar sesion como ${quien}: codigo ${respuesta.status()}`);
  }
  const cuerpo = await respuesta.json();
  return { token: cuerpo.token, usuario: cuerpo.usuario, cabecera: { Authorization: `Bearer ${cuerpo.token}` } };
};

const catalogo = async (peticion) => {
  const disciplinas = await (await peticion.get('/api/catalogo/disciplinas')).json();
  const clases = await (await peticion.get('/api/catalogo/clases')).json();
  return { disciplinas: disciplinas.disciplinas, clases: clases.clases };
};

const nivelesDe = async (peticion, idDisciplina) => {
  const cuerpo = await (await peticion.get(`/api/catalogo/disciplinas/${idDisciplina}/niveles`)).json();
  return cuerpo.niveles;
};

/** Clase con mas cupo libre de una disciplina: la eleccion mas estable. */
const claseConMasCupo = (clases, idDisciplina) =>
  clases
    .filter((c) => c.id_disciplina === idDisciplina && c.cupo_disponible > 0)
    .sort((a, b) => b.cupo_disponible - a.cupo_disponible)[0];

const crearSolicitud = async (peticion, { idDisciplina, edad = 10, sufijo = marca() }) => {
  const respuesta = await peticion.post('/api/inscripcion/solicitudes', {
    data: {
      nombreAspirante: `Aspirante de prueba ${sufijo}`,
      fechaNacimiento: fechaParaEdad(edad),
      idDisciplina,
      nombreEncargado: `Encargado de prueba ${sufijo}`,
      correoContacto: `prueba.${sufijo}@pda.local`,
      telefonoContacto: '5555-9999',
    },
  });
  return { respuesta, cuerpo: respuesta.ok() ? await respuesta.json() : await respuesta.json().catch(() => ({})) };
};

/**
 * Registra una alumna nueva y devuelve su identificador junto con la sesion de
 * la direccion. Sirve para que una prueba que necesita una mensualidad
 * pendiente se la fabrique, en lugar de apoyarse en la que dejo otra prueba:
 * esa dependencia hace que el resultado cambie segun el orden de ejecucion.
 */
const registrarAlumna = async (peticion) => {
  const { disciplinas, clases } = await catalogo(peticion);
  const disciplina = disciplinas[0];
  const clase = claseConMasCupo(clases, disciplina.id_disciplina);
  if (!clase) {
    throw new Error(
      'No queda ninguna clase con cupo para registrar una alumna. '
      + 'Ejecutar "npm run datos:reiniciar" para devolver el entorno a su estado inicial.'
    );
  }

  const niveles = await nivelesDe(peticion, disciplina.id_disciplina);
  const sesion = await iniciarSesion(peticion, 'administrador');

  const { cuerpo } = await crearSolicitud(peticion, {
    idDisciplina: disciplina.id_disciplina,
    edad: Math.max(disciplina.edad_minima ?? 6, 6),
  });

  const respuesta = await peticion.post(
    `/api/inscripcion/solicitudes/${cuerpo.solicitud.id_solicitud}/aceptar`,
    { headers: sesion.cabecera, data: { idClase: clase.id_clase, idNivel: niveles[0].id_nivel } }
  );
  if (!respuesta.ok()) {
    throw new Error(`No se pudo registrar la alumna de apoyo: codigo ${respuesta.status()}`);
  }

  const registro = await respuesta.json();
  const mensualidades = await (await peticion.get(
    `/api/pagos/mensualidades?alumna=${registro.alumna.id_alumna}`,
    { headers: sesion.cabecera }
  )).json();

  return {
    sesion,
    idAlumna: registro.alumna.id_alumna,
    disciplina,
    mensualidad: mensualidades.mensualidades[0],
  };
};

module.exports = {
  CREDENCIALES,
  registrarAlumna,
  marca,
  fechaParaEdad,
  iniciarSesion,
  catalogo,
  nivelesDe,
  claseConMasCupo,
  crearSolicitud,
};
