'use strict';

const request = require('supertest');

jest.mock('../../src/modules/catalogo/repositorio');
jest.mock('../../src/core/db', () => ({
  consultar: jest.fn(),
  transaccion: jest.fn(),
  verificarConexion: jest.fn().mockResolvedValue(true),
  cerrar: jest.fn(),
}));
jest.mock('../../src/core/cache');

const repositorio = require('../../src/modules/catalogo/repositorio');
const cache = require('../../src/core/cache');
const { crearApp } = require('../../src/core/app');

const app = crearApp('catalogo');

const DISCIPLINAS = [
  { id_disciplina: 1, nombre: 'Ballet clasico', edad_minima: 4, edad_maxima: 25, monto_mensualidad: '250.00', total_niveles: 4 },
  { id_disciplina: 2, nombre: 'Jazz', edad_minima: 8, edad_maxima: 30, monto_mensualidad: '225.00', total_niveles: 2 },
];

beforeEach(() => {
  jest.clearAllMocks();
  cache.obtener.mockResolvedValue(null);
  cache.guardar.mockResolvedValue(true);
  cache.invalidar.mockResolvedValue(0);
});

describe('consulta publica del catalogo', () => {
  test('la primera consulta lee de la base de datos y deja el resultado en cache', async () => {
    repositorio.listarDisciplinas.mockResolvedValue(DISCIPLINAS);

    const respuesta = await request(app).get('/api/catalogo/disciplinas');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.origen).toBe('base_de_datos');
    expect(respuesta.body.disciplinas).toHaveLength(2);
    expect(cache.guardar).toHaveBeenCalledWith('catalogo:disciplinas', DISCIPLINAS);
  });

  test('la consulta siguiente se resuelve desde cache sin tocar PostgreSQL', async () => {
    cache.obtener.mockResolvedValue(DISCIPLINAS);

    const respuesta = await request(app).get('/api/catalogo/disciplinas');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.origen).toBe('cache');
    expect(repositorio.listarDisciplinas).not.toHaveBeenCalled();
  });

  test('no exige sesion: la oferta se consulta antes de ser usuaria', async () => {
    repositorio.listarDisciplinas.mockResolvedValue(DISCIPLINAS);
    const respuesta = await request(app).get('/api/catalogo/disciplinas');
    expect(respuesta.status).not.toBe(401);
  });

  test('devuelve 404 al pedir los niveles de una disciplina inexistente', async () => {
    repositorio.buscarDisciplina.mockResolvedValue(null);

    const respuesta = await request(app).get('/api/catalogo/disciplinas/99/niveles');

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  test('las clases se pueden filtrar por disciplina y reportan el cupo disponible', async () => {
    repositorio.listarClases.mockResolvedValue([
      {
        id_clase: 1, disciplina: 'Ballet clasico', nivel: 'Pre-ballet', docente: 'Maria Jose Lopez',
        dia_semana: 'Lunes', hora_inicio: '15:00:00', cupo_maximo: 12, cupo_disponible: 9,
      },
    ]);

    const respuesta = await request(app).get('/api/catalogo/clases?disciplina=1');

    expect(respuesta.status).toBe(200);
    expect(repositorio.listarClases).toHaveBeenCalledWith({ idDisciplina: 1, idNivel: null });
    expect(respuesta.body.clases[0].cupo_disponible).toBe(9);
  });

  test('invalidar la cache exige sesion de administrador', async () => {
    const respuesta = await request(app).post('/api/catalogo/cache/invalidar');
    expect(respuesta.status).toBe(401);
  });
});
