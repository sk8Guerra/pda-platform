'use strict';

/**
 * Arranque del proceso.
 *
 * La cache es opcional por diseno: si Redis no responde, las lecturas caen a
 * PostgreSQL sin error. Esa decision obliga a que el arranque tampoco dependa
 * de ella. El cliente de Redis reintenta de forma indefinida, de modo que
 * esperar su conexion dejaba el proceso vivo pero sin escuchar en su puerto: el
 * contenedor figuraba en marcha y no respondia siquiera la sonda de vida.
 *
 * Esta prueba fija ese contrato. El doble de la cache devuelve una promesa que
 * nunca se resuelve, que es justo lo que ocurre cuando Redis no esta.
 */

jest.mock('../../src/core/cache', () => ({
  conectar: jest.fn(() => new Promise(() => {})),
  cerrar: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/core/db', () => ({
  cerrar: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/core/app', () => ({
  crearApp: jest.fn(() => ({
    listen: jest.fn((_puerto, alEscuchar) => {
      if (alEscuchar) alEscuchar();
      return { close: jest.fn() };
    }),
  })),
}));

const cache = require('../../src/core/cache');
const { crearApp } = require('../../src/core/app');
const { arrancar } = require('../../src/server');

/** La aplicacion que devolvio la ultima llamada a crearApp. */
const ultimaApp = () => crearApp.mock.results.at(-1).value;

describe('arranque del servicio', () => {
  test('el servidor escucha aunque Redis no llegue a conectar', async () => {
    await arrancar();

    expect(cache.conectar).toHaveBeenCalled();
    expect(crearApp).toHaveBeenCalled();
    expect(ultimaApp().listen).toHaveBeenCalledWith(expect.any(Number), expect.any(Function));
  });

  test('no deja sin atender el rechazo de la conexion con Redis', async () => {
    cache.conectar.mockReturnValueOnce(Promise.reject(new Error('conexion rechazada')));

    // Si el rechazo no se atendiera, Node lo reportaria como promesa no
    // gestionada y el proceso terminaria en las versiones recientes.
    await expect(arrancar()).resolves.toBeUndefined();
    expect(ultimaApp().listen).toHaveBeenCalled();
  });
});
