'use strict';

const request = require('supertest');

jest.mock('../../src/core/db', () => ({
  consultar: jest.fn().mockResolvedValue({ rows: [] }),
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

const { crearApp } = require('../../src/core/app');

/**
 * La consola operativa es la superficie que ejercitan las pruebas de aceptacion
 * en navegador. Esta bateria comprueba que el servidor la entrega y que los
 * puntos de anclaje que usan esas pruebas siguen presentes: si alguien renombra
 * un atributo data-prueba al rediseniar la pantalla, el fallo aparece aqui, en
 * dos segundos, y no veinte minutos despues en la etapa de aceptacion.
 */

const app = crearApp('monolito');

describe('entrega de la consola operativa', () => {
  test('la raiz devuelve la pantalla en HTML', async () => {
    const respuesta = await request(app).get('/');

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['content-type']).toMatch(/text\/html/);
    expect(respuesta.text).toMatch(/Perfect Dance Academy/);
  });

  test('la hoja de estilo y el guion se sirven como archivos propios', async () => {
    const estilos = await request(app).get('/estilos.css');
    const guion = await request(app).get('/app.js');

    expect(estilos.status).toBe(200);
    expect(estilos.headers['content-type']).toMatch(/text\/css/);
    expect(guion.status).toBe(200);
    expect(guion.headers['content-type']).toMatch(/javascript/);
  });

  test('la pantalla no lleva estilos ni guiones en linea, que la politica de contenido bloquea', async () => {
    const { text } = await request(app).get('/');

    expect(text).not.toMatch(/<script>[^<]/);
    expect(text).not.toMatch(/\sstyle="/);
  });

  const anclajes = [
    'tab-catalogo', 'tab-solicitud', 'tab-direccion', 'tab-pagos',
    'btn-cargar-catalogo', 'tabla-disciplinas', 'tabla-clases',
    'formulario-solicitud', 'campo-nombre-aspirante', 'campo-fecha-nacimiento',
    'campo-disciplina', 'campo-nombre-encargado', 'btn-enviar-solicitud',
    'resultado-solicitud', 'formulario-sesion', 'campo-correo-sesion',
    'campo-contrasena', 'btn-iniciar-sesion', 'estado-sesion',
    'formulario-resolucion', 'campo-id-solicitud', 'campo-clase', 'campo-nivel',
    'btn-aceptar', 'btn-rechazar', 'resultado-resolucion',
    'campo-id-alumna', 'btn-cargar-mensualidades', 'tabla-mensualidades',
    'campo-id-mensualidad', 'campo-medio-pago', 'btn-pagar', 'resultado-pago',
  ];

  test('conserva los puntos de anclaje que usan las pruebas de aceptacion', async () => {
    const { text } = await request(app).get('/');
    const ausentes = anclajes.filter((nombre) => !text.includes(`data-prueba="${nombre}"`));

    expect(ausentes).toEqual([]);
  });

  test('cada servicio de la topologia por modulos tambien sirve la consola', async () => {
    const respuesta = await request(crearApp('catalogo')).get('/');
    expect(respuesta.status).toBe(200);
  });

  test('la consola no desplaza a la API ni a las sondas', async () => {
    const salud = await request(app).get('/health/vivo');
    const catalogo = await request(app).get('/api/catalogo/disciplinas');

    expect(salud.status).toBe(200);
    expect(catalogo.status).toBe(200);
  });
});
