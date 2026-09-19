'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/modules/inscripcion/repositorio');
jest.mock('../../src/core/db', () => ({
  consultar: jest.fn(),
  transaccion: jest.fn(),
  verificarConexion: jest.fn().mockResolvedValue(true),
  cerrar: jest.fn(),
}));
jest.mock('../../src/core/cache');

const repositorio = require('../../src/modules/inscripcion/repositorio');
const db = require('../../src/core/db');
const cache = require('../../src/core/cache');
const { crearApp } = require('../../src/core/app');

const app = crearApp('inscripcion');

const BALLET = { id_disciplina: 1, disciplina: 'Ballet clasico', edad_minima: 4, edad_maxima: 25 };

const tokenAdministrador = () =>
  jwt.sign({ sub: 1, rol: 'Administrador', correo: 'direccion@pda.local' }, process.env.JWT_SECRET);

const tokenDocente = () =>
  jwt.sign({ sub: 2, rol: 'Docente', correo: 'docente@pda.local' }, process.env.JWT_SECRET);

/** Cliente de transaccion simulado: devuelve resultados encolados por la prueba. */
const clienteSimulado = (resultados = []) => ({
  query: jest.fn(() => Promise.resolve(resultados.shift() || { rows: [] })),
});

beforeEach(() => {
  jest.clearAllMocks();
  cache.bloquear.mockResolvedValue(true);
  cache.liberar.mockResolvedValue(undefined);
  cache.invalidar.mockResolvedValue(0);
});

describe('tramo 1: envio de la solicitud de inscripcion', () => {
  test('registra la solicitud de una aspirante dentro del rango de edad', async () => {
    db.transaccion.mockImplementation((trabajo) => trabajo(clienteSimulado([{ rows: [BALLET] }])));
    repositorio.crearSolicitud.mockResolvedValue({
      id_solicitud: 10, nombre_aspirante: 'Sofia Ruiz Mendez', estado: 'Recibida',
    });

    const respuesta = await request(app).post('/api/inscripcion/solicitudes').send({
      nombreAspirante: 'Sofia Ruiz Mendez',
      fechaNacimiento: '2016-03-14',
      idDisciplina: 1,
      nombreEncargado: 'Ana Ruiz',
      correoContacto: 'encargado@pda.local',
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.solicitud.estado).toBe('Recibida');
    expect(respuesta.body.disciplina).toBe('Ballet clasico');
  });

  test('no exige sesion: quien solicita todavia no es usuaria de la plataforma', async () => {
    db.transaccion.mockImplementation((trabajo) => trabajo(clienteSimulado([{ rows: [BALLET] }])));
    repositorio.crearSolicitud.mockResolvedValue({ id_solicitud: 11, estado: 'Recibida' });

    const respuesta = await request(app).post('/api/inscripcion/solicitudes').send({
      nombreAspirante: 'Valeria Perez',
      fechaNacimiento: '2012-09-02',
      idDisciplina: 1,
      nombreEncargado: 'Carlos Perez',
    });

    expect(respuesta.status).toBe(201);
  });

  test('enumera los campos que faltan en lugar de fallar de forma generica', async () => {
    const respuesta = await request(app)
      .post('/api/inscripcion/solicitudes')
      .send({ nombreAspirante: 'Sofia Ruiz Mendez' });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('DATOS_INCOMPLETOS');
    expect(respuesta.body.error.mensaje).toMatch(/fecha de nacimiento/);
    expect(respuesta.body.error.mensaje).toMatch(/disciplina/);
  });

  test('rechaza a una aspirante que no alcanza la edad minima de la disciplina', async () => {
    db.transaccion.mockImplementation((trabajo) => trabajo(clienteSimulado([{ rows: [BALLET] }])));

    const respuesta = await request(app).post('/api/inscripcion/solicitudes').send({
      nombreAspirante: 'Bebe Prueba',
      fechaNacimiento: '2024-01-10',
      idDisciplina: 1,
      nombreEncargado: 'Ana Ruiz',
    });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.codigo).toBe('EDAD_FUERA_DE_RANGO');
    expect(repositorio.crearSolicitud).not.toHaveBeenCalled();
  });

  test('devuelve 404 si la disciplina solicitada no existe', async () => {
    db.transaccion.mockImplementation((trabajo) => trabajo(clienteSimulado([{ rows: [] }])));

    const respuesta = await request(app).post('/api/inscripcion/solicitudes').send({
      nombreAspirante: 'Sofia Ruiz Mendez',
      fechaNacimiento: '2016-03-14',
      idDisciplina: 99,
      nombreEncargado: 'Ana Ruiz',
    });

    expect(respuesta.status).toBe(404);
  });
});

describe('tramo 2: aceptacion y registro de la alumna', () => {
  const solicitudRecibida = {
    id_solicitud: 10,
    nombre_aspirante: 'Sofia Ruiz Mendez',
    fecha_nacimiento: '2016-03-14',
    nombre_encargado: 'Ana Ruiz',
    telefono_contacto: '5555-0003',
    id_disciplina: 1,
    disciplina: 'Ballet clasico',
    edad_minima: 4,
    edad_maxima: 25,
    estado: 'Recibida',
  };

  const prepararAceptacion = ({ solicitud = solicitudRecibida, clase, cupo } = {}) => {
    db.transaccion.mockImplementation((trabajo) =>
      trabajo(clienteSimulado([{ rows: [solicitud] }])));
    repositorio.datosDeClase.mockResolvedValue(clase);
    repositorio.cupoConfirmado.mockResolvedValue(cupo);
    repositorio.crearAlumna.mockResolvedValue({ id_alumna: 5, nombre_completo: solicitud.nombre_aspirante });
    repositorio.asignarDisciplina.mockResolvedValue({ id_alumna: 5, id_disciplina: 1, id_nivel: 1 });
    repositorio.reservarCupo.mockResolvedValue({ id_reserva: 77, estado: 'Confirmada' });
    repositorio.cerrarSolicitud.mockResolvedValue({ ...solicitud, estado: 'Aceptada', id_alumna_generada: 5 });
    repositorio.registrarAuditoria.mockResolvedValue(undefined);
  };

  const CLASE_LUNES = {
    id_clase: 1, id_disciplina: 1, id_nivel: 1, id_docente: 2,
    dia_semana: 'Lunes', hora_inicio: '15:00:00', hora_fin: '16:00:00',
    docente: 'Maria Jose Lopez',
  };

  test('crea la alumna y le asigna clase, horario y docente en una sola operacion', async () => {
    prepararAceptacion({ clase: CLASE_LUNES, cupo: { cupo_maximo: 12, ocupados: 9 } });

    const respuesta = await request(app)
      .post('/api/inscripcion/solicitudes/10/aceptar')
      .set('Authorization', `Bearer ${tokenAdministrador()}`)
      .send({ idClase: 1, idNivel: 1 });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.alumna.id_alumna).toBe(5);
    expect(respuesta.body.asignacion).toMatchObject({
      idClase: 1, diaSemana: 'Lunes', docente: 'Maria Jose Lopez', idReserva: 77,
    });
    expect(respuesta.body.solicitud.estado).toBe('Aceptada');
  });

  test('deja constancia de la aceptacion en la bitacora de auditoria', async () => {
    prepararAceptacion({ clase: CLASE_LUNES, cupo: { cupo_maximo: 12, ocupados: 0 } });

    await request(app)
      .post('/api/inscripcion/solicitudes/10/aceptar')
      .set('Authorization', `Bearer ${tokenAdministrador()}`)
      .send({ idClase: 1, idNivel: 1 });

    expect(repositorio.registrarAuditoria).toHaveBeenCalledWith(
      expect.anything(), 1, 'aceptar_inscripcion', 'solicitud_inscripcion', 10, expect.any(String)
    );
  });

  test('impide el registro cuando la clase ya no tiene cupo disponible', async () => {
    prepararAceptacion({ clase: CLASE_LUNES, cupo: { cupo_maximo: 12, ocupados: 12 } });

    const respuesta = await request(app)
      .post('/api/inscripcion/solicitudes/10/aceptar')
      .set('Authorization', `Bearer ${tokenAdministrador()}`)
      .send({ idClase: 1, idNivel: 1 });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.mensaje).toMatch(/cupo disponible/i);
    expect(repositorio.crearAlumna).not.toHaveBeenCalled();
  });

  test('rechaza una clase que pertenece a otra disciplina', async () => {
    prepararAceptacion({
      clase: { ...CLASE_LUNES, id_clase: 4, id_disciplina: 2 },
      cupo: { cupo_maximo: 18, ocupados: 1 },
    });

    const respuesta = await request(app)
      .post('/api/inscripcion/solicitudes/10/aceptar')
      .set('Authorization', `Bearer ${tokenAdministrador()}`)
      .send({ idClase: 4, idNivel: 5 });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.codigo).toBe('CLASE_INCOMPATIBLE');
  });

  test('no permite resolver dos veces la misma solicitud', async () => {
    prepararAceptacion({
      solicitud: { ...solicitudRecibida, estado: 'Aceptada' },
      clase: CLASE_LUNES,
      cupo: { cupo_maximo: 12, ocupados: 1 },
    });

    const respuesta = await request(app)
      .post('/api/inscripcion/solicitudes/10/aceptar')
      .set('Authorization', `Bearer ${tokenAdministrador()}`)
      .send({ idClase: 1, idNivel: 1 });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.mensaje).toMatch(/ya fue resuelta/i);
  });

  test('libera el bloqueo de la clase aunque el registro falle', async () => {
    prepararAceptacion({ clase: CLASE_LUNES, cupo: { cupo_maximo: 12, ocupados: 12 } });

    await request(app)
      .post('/api/inscripcion/solicitudes/10/aceptar')
      .set('Authorization', `Bearer ${tokenAdministrador()}`)
      .send({ idClase: 1, idNivel: 1 });

    expect(cache.liberar).toHaveBeenCalledWith('clase:1');
  });

  test('devuelve 409 si otro registro tiene tomado el bloqueo de la clase', async () => {
    cache.bloquear.mockResolvedValue(false);

    const respuesta = await request(app)
      .post('/api/inscripcion/solicitudes/10/aceptar')
      .set('Authorization', `Bearer ${tokenAdministrador()}`)
      .send({ idClase: 1, idNivel: 1 });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.mensaje).toMatch(/en este momento/i);
  });

  test('solo la direccion puede aceptar una solicitud', async () => {
    const respuesta = await request(app)
      .post('/api/inscripcion/solicitudes/10/aceptar')
      .set('Authorization', `Bearer ${tokenDocente()}`)
      .send({ idClase: 1, idNivel: 1 });

    expect(respuesta.status).toBe(403);
  });

  test('exige indicar la clase y el nivel de la asignacion', async () => {
    const respuesta = await request(app)
      .post('/api/inscripcion/solicitudes/10/aceptar')
      .set('Authorization', `Bearer ${tokenAdministrador()}`)
      .send({});

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('DATOS_INCOMPLETOS');
  });
});
