'use strict';

const request = require('supertest');

jest.mock('../../src/core/db', () => ({
  consultar: jest.fn(),
  transaccion: jest.fn(),
  verificarConexion: jest.fn().mockResolvedValue(true),
  cerrar: jest.fn(),
}));

jest.mock('../../src/core/cache', () => ({
  conectar: jest.fn(),
  obtener: jest.fn().mockResolvedValue(null),
  guardar: jest.fn().mockResolvedValue(true),
  invalidar: jest.fn().mockResolvedValue(0),
  bloquear: jest.fn().mockResolvedValue(true),
  liberar: jest.fn().mockResolvedValue(undefined),
  verificarConexion: jest.fn().mockResolvedValue(true),
  cerrar: jest.fn(),
  estaDisponible: () => true,
}));

const db = require('../../src/core/db');
const { crearApp } = require('../../src/core/app');

/**
 * La sonda /health es el contrato que consumen Docker, el balanceador de AWS y
 * el panel de CloudWatch. Debe existir y comportarse igual en ambas topologias.
 */

describe('sonda de salud', () => {
  test('el monolito reporta los cuatro modulos montados', async () => {
    const respuesta = await request(crearApp('monolito')).get('/health');
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.estado).toBe('ok');
    expect(respuesta.body.modulos.sort()).toEqual(['auth', 'catalogo', 'inscripcion', 'pagos']);
  });

  test.each(['auth', 'catalogo', 'inscripcion', 'pagos'])(
    'el servicio %s reporta unicamente su propio modulo',
    async (servicio) => {
      const respuesta = await request(crearApp(servicio)).get('/health');
      expect(respuesta.status).toBe(200);
      expect(respuesta.body.servicio).toBe(servicio);
      expect(respuesta.body.modulos).toEqual([servicio]);
    }
  );

  test('la sonda de vida responde sin consultar dependencias', async () => {
    const respuesta = await request(crearApp('auth')).get('/health/vivo');
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.estado).toBe('ok');
  });

  test('reporta estado degradado y codigo 503 si PostgreSQL no responde', async () => {
    db.verificarConexion.mockRejectedValueOnce(new Error('conexion rechazada'));
    const respuesta = await request(crearApp('monolito')).get('/health');
    expect(respuesta.status).toBe(503);
    expect(respuesta.body.estado).toBe('degradado');
    expect(respuesta.body.dependencias.postgres).toBe('error');
  });

  test('una ruta inexistente devuelve 404 con el formato de error de la plataforma', async () => {
    const respuesta = await request(crearApp('monolito')).get('/api/inexistente');
    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.codigo).toBe('NO_ENCONTRADO');
  });
});
