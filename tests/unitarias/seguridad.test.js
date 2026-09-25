'use strict';

const jwt = require('jsonwebtoken');
const {
  emitirToken,
  verificarToken,
  requiereSesion,
  requiereRol,
} = require('../../src/core/seguridad');

/**
 * Emision y verificacion de credenciales de sesion (RNF-015, RNF-020).
 *
 * El token es la unica prueba de identidad que la plataforma acepta: no hay
 * estado de sesion en el servidor. De ahi que su contenido, su caducidad y el
 * rechazo de cualquier token alterado sean reglas que se verifican de forma
 * aislada, sin levantar la aplicacion.
 */

const usuario = {
  id_usuario: 7,
  nombre_rol: 'Administrador',
  correo_electronico: 'direccion@pda.local',
};

const invocar = (middleware, peticion) => new Promise((resolver) => {
  middleware(peticion, {}, (err) => resolver(err));
});

describe('emision del token de sesion', () => {
  test('incluye el identificador, el rol y el correo, y nada mas del usuario', () => {
    const contenido = verificarToken(emitirToken(usuario));

    expect(contenido.sub).toBe(7);
    expect(contenido.rol).toBe('Administrador');
    expect(contenido.correo).toBe('direccion@pda.local');
    expect(contenido).not.toHaveProperty('contrasena_hash');
  });

  test('fija una caducidad: el token no es valido de forma indefinida', () => {
    const contenido = verificarToken(emitirToken(usuario));
    expect(contenido.exp).toBeGreaterThan(contenido.iat);
  });

  test('rechaza un token firmado con otro secreto', () => {
    const ajeno = jwt.sign({ sub: 1, rol: 'Administrador' }, 'otro-secreto');
    expect(() => verificarToken(ajeno)).toThrow();
  });

  test('rechaza un token al que se le altero un caracter de la firma', () => {
    const token = emitirToken(usuario);
    const alterado = `${token.slice(0, -1)}${token.slice(-1) === 'a' ? 'b' : 'a'}`;
    expect(() => verificarToken(alterado)).toThrow();
  });
});

describe('middleware que exige sesion', () => {
  test('deja pasar una cabecera Bearer con un token valido', async () => {
    const peticion = { headers: { authorization: `Bearer ${emitirToken(usuario)}` } };
    const error = await invocar(requiereSesion, peticion);

    expect(error).toBeUndefined();
    expect(peticion.usuario.rol).toBe('Administrador');
  });

  test('responde 401 cuando no viene cabecera de autorizacion', async () => {
    const error = await invocar(requiereSesion, { headers: {} });
    expect(error.estado).toBe(401);
    expect(error.codigo).toBe('NO_AUTORIZADO');
  });

  test('responde 401 cuando el esquema no es Bearer', async () => {
    const error = await invocar(requiereSesion, {
      headers: { authorization: `Basic ${Buffer.from('a:b').toString('base64')}` },
    });
    expect(error.estado).toBe(401);
  });

  test('distingue la sesion expirada del token invalido', async () => {
    const expirado = jwt.sign(
      { sub: 7, rol: 'Administrador' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );
    const error = await invocar(requiereSesion, { headers: { authorization: `Bearer ${expirado}` } });

    expect(error.estado).toBe(401);
    expect(error.message).toMatch(/expiro por inactividad/i);
  });
});

describe('middleware que restringe por rol', () => {
  test('deja pasar al rol autorizado', async () => {
    const error = await invocar(requiereRol('Administrador'), { usuario: { rol: 'Administrador' } });
    expect(error).toBeUndefined();
  });

  test('responde 403 a un rol distinto del autorizado', async () => {
    const error = await invocar(requiereRol('Administrador'), { usuario: { rol: 'Docente' } });
    expect(error.estado).toBe(403);
    expect(error.codigo).toBe('PROHIBIDO');
  });

  test('responde 401 si la peticion llega sin usuario resuelto', async () => {
    const error = await invocar(requiereRol('Administrador'), {});
    expect(error.estado).toBe(401);
  });
});
