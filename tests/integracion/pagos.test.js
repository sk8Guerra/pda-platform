'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/modules/pagos/repositorio');
jest.mock('../../src/modules/pagos/pasarela');
jest.mock('../../src/core/db', () => ({
  consultar: jest.fn(),
  transaccion: jest.fn(),
  verificarConexion: jest.fn().mockResolvedValue(true),
  cerrar: jest.fn(),
}));
jest.mock('../../src/core/cache');

const repositorio = require('../../src/modules/pagos/repositorio');
const pasarela = require('../../src/modules/pagos/pasarela');
const db = require('../../src/core/db');
const { crearApp } = require('../../src/core/app');

const app = crearApp('pagos');

const token = () =>
  jwt.sign({ sub: 3, rol: 'Encargado/Alumna', correo: 'encargado@pda.local' }, process.env.JWT_SECRET);

const MENSUALIDAD = { id_mensualidad: 1, id_alumna: 5, monto: '250.00', estado: 'Pendiente', id_pago: null };

beforeEach(() => {
  jest.clearAllMocks();
  db.transaccion.mockImplementation((trabajo) => trabajo({ query: jest.fn() }));
});

describe('consulta de mensualidades', () => {
  test('exige sesion', async () => {
    const respuesta = await request(app).get('/api/pagos/mensualidades?alumna=5');
    expect(respuesta.status).toBe(401);
  });

  test('devuelve las mensualidades de la alumna indicada', async () => {
    repositorio.listarMensualidades.mockResolvedValue([MENSUALIDAD]);

    const respuesta = await request(app)
      .get('/api/pagos/mensualidades?alumna=5&estado=Pendiente')
      .set('Authorization', `Bearer ${token()}`);

    expect(respuesta.status).toBe(200);
    expect(repositorio.listarMensualidades).toHaveBeenCalledWith(5, 'Pendiente');
    expect(respuesta.body.mensualidades).toHaveLength(1);
  });

  test('exige el identificador de la alumna', async () => {
    const respuesta = await request(app)
      .get('/api/pagos/mensualidades')
      .set('Authorization', `Bearer ${token()}`);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('DATOS_INCOMPLETOS');
  });
});

describe('pago de una mensualidad', () => {
  test('registra el pago, emite comprobante y salda la mensualidad', async () => {
    repositorio.buscarMensualidad.mockResolvedValue(MENSUALIDAD);
    pasarela.autorizar.mockResolvedValue({ aprobado: true, referenciaPasarela: 'SIM-123' });
    repositorio.crearPago.mockResolvedValue({ id_pago: 1, estado_transaccion: 'Aprobado' });
    repositorio.crearComprobante.mockResolvedValue({ numero_correlativo: 'PDA-00000001' });
    repositorio.saldarMensualidad.mockResolvedValue({ id_mensualidad: 1, estado: 'Pagada', id_pago: 1 });

    const respuesta = await request(app)
      .post('/api/pagos/mensualidades/1/pagar')
      .set('Authorization', `Bearer ${token()}`)
      .send({ medioPago: 'Tarjeta', tokenTarjeta: 'tok_sandbox' });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.aprobado).toBe(true);
    expect(respuesta.body.mensualidad.estado).toBe('Pagada');
    expect(respuesta.body.comprobante.numero_correlativo).toBe('PDA-00000001');
  });

  test('nunca recibe ni reenvia el numero de tarjeta, solo el token de la pasarela', async () => {
    repositorio.buscarMensualidad.mockResolvedValue(MENSUALIDAD);
    pasarela.autorizar.mockResolvedValue({ aprobado: true, referenciaPasarela: 'SIM-123' });
    repositorio.crearPago.mockResolvedValue({ id_pago: 1 });
    repositorio.crearComprobante.mockResolvedValue({ numero_correlativo: 'PDA-00000001' });
    repositorio.saldarMensualidad.mockResolvedValue({ estado: 'Pagada' });

    await request(app)
      .post('/api/pagos/mensualidades/1/pagar')
      .set('Authorization', `Bearer ${token()}`)
      .send({ medioPago: 'Tarjeta', tokenTarjeta: 'tok_sandbox' });

    const argumentos = pasarela.autorizar.mock.calls[0][0];
    expect(argumentos).toEqual({ tokenTarjeta: 'tok_sandbox', monto: 250, referencia: 'mensualidad-1' });
    expect(JSON.stringify(argumentos)).not.toMatch(/\d{13,19}/);
  });

  test('deja la mensualidad pendiente y responde 402 si la pasarela rechaza', async () => {
    repositorio.buscarMensualidad.mockResolvedValue(MENSUALIDAD);
    pasarela.autorizar.mockResolvedValue({ aprobado: false, referenciaPasarela: null });
    repositorio.crearPago.mockResolvedValue({ id_pago: 2, estado_transaccion: 'Rechazado' });

    const respuesta = await request(app)
      .post('/api/pagos/mensualidades/1/pagar')
      .set('Authorization', `Bearer ${token()}`)
      .send({ medioPago: 'Tarjeta', tokenTarjeta: 'tok_invalido' });

    expect(respuesta.status).toBe(402);
    expect(respuesta.body.aprobado).toBe(false);
    expect(repositorio.saldarMensualidad).not.toHaveBeenCalled();
    expect(repositorio.crearComprobante).not.toHaveBeenCalled();
  });

  test('no vuelve a cobrar una mensualidad ya saldada', async () => {
    repositorio.buscarMensualidad.mockResolvedValue({ ...MENSUALIDAD, estado: 'Pagada', id_pago: 1 });

    const respuesta = await request(app)
      .post('/api/pagos/mensualidades/1/pagar')
      .set('Authorization', `Bearer ${token()}`)
      .send({ medioPago: 'Tarjeta', tokenTarjeta: 'tok_sandbox' });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.mensaje).toMatch(/ya fue saldada/i);
  });

  test('rechaza un medio de pago no contemplado', async () => {
    const respuesta = await request(app)
      .post('/api/pagos/mensualidades/1/pagar')
      .set('Authorization', `Bearer ${token()}`)
      .send({ medioPago: 'Criptomoneda' });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.codigo).toBe('MEDIO_NO_VALIDO');
  });

  test('un pago en efectivo no consulta la pasarela', async () => {
    repositorio.buscarMensualidad.mockResolvedValue(MENSUALIDAD);
    repositorio.crearPago.mockResolvedValue({ id_pago: 3, estado_transaccion: 'Aprobado' });
    repositorio.crearComprobante.mockResolvedValue({ numero_correlativo: 'PDA-00000003' });
    repositorio.saldarMensualidad.mockResolvedValue({ estado: 'Pagada' });

    const respuesta = await request(app)
      .post('/api/pagos/mensualidades/1/pagar')
      .set('Authorization', `Bearer ${token()}`)
      .send({ medioPago: 'Efectivo' });

    expect(respuesta.status).toBe(201);
    expect(pasarela.autorizar).not.toHaveBeenCalled();
  });

  test('devuelve 404 cuando la mensualidad no existe', async () => {
    repositorio.buscarMensualidad.mockResolvedValue(null);

    const respuesta = await request(app)
      .post('/api/pagos/mensualidades/99/pagar')
      .set('Authorization', `Bearer ${token()}`)
      .send({ medioPago: 'Efectivo' });

    expect(respuesta.status).toBe(404);
  });
});
