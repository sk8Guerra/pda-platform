'use strict';

const request = require('supertest');
const bcrypt = require('bcryptjs');

jest.mock('../../src/modules/auth/repositorio');
jest.mock('../../src/core/db', () => ({
  consultar: jest.fn(),
  transaccion: jest.fn(),
  verificarConexion: jest.fn().mockResolvedValue(true),
  cerrar: jest.fn(),
}));
jest.mock('../../src/core/cache', () => ({
  conectar: jest.fn(),
  obtener: jest.fn().mockResolvedValue(null),
  guardar: jest.fn(),
  invalidar: jest.fn(),
  bloquear: jest.fn(),
  liberar: jest.fn(),
  verificarConexion: jest.fn().mockResolvedValue(true),
  cerrar: jest.fn(),
  estaDisponible: () => true,
}));

const repositorio = require('../../src/modules/auth/repositorio');
const { crearApp } = require('../../src/core/app');

const app = crearApp('auth');

const usuarioActivo = {
  id_usuario: 1,
  nombre_completo: 'Thelma Aguilar',
  correo_electronico: 'direccion@pda.local',
  contrasena_hash: bcrypt.hashSync('Pda2026*admin', 4),
  estado: 'Activo',
  nombre_rol: 'Administrador',
};

beforeEach(() => {
  jest.clearAllMocks();
  repositorio.registrarAuditoria.mockResolvedValue(undefined);
});

describe('inicio de sesion', () => {
  test('entrega un token y los datos del usuario con credenciales correctas', async () => {
    repositorio.buscarUsuarioPorCorreo.mockResolvedValue(usuarioActivo);

    const respuesta = await request(app)
      .post('/api/auth/login')
      .send({ correo: 'direccion@pda.local', contrasena: 'Pda2026*admin' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.token).toEqual(expect.any(String));
    expect(respuesta.body.usuario.rol).toBe('Administrador');
    expect(respuesta.body.usuario).not.toHaveProperty('contrasena_hash');
  });

  test('deja constancia del inicio de sesion en la bitacora de auditoria', async () => {
    repositorio.buscarUsuarioPorCorreo.mockResolvedValue(usuarioActivo);

    await request(app)
      .post('/api/auth/login')
      .send({ correo: 'direccion@pda.local', contrasena: 'Pda2026*admin' });

    expect(repositorio.registrarAuditoria).toHaveBeenCalledWith(
      1, 'inicio_sesion', 'usuario', 1, expect.any(String)
    );
  });

  test('rechaza una contrasena incorrecta sin revelar si el correo existe', async () => {
    repositorio.buscarUsuarioPorCorreo.mockResolvedValue(usuarioActivo);

    const respuesta = await request(app)
      .post('/api/auth/login')
      .send({ correo: 'direccion@pda.local', contrasena: 'incorrecta' });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.mensaje).toBe('Credenciales invalidas');
  });

  test('responde igual cuando el correo no existe', async () => {
    repositorio.buscarUsuarioPorCorreo.mockResolvedValue(null);

    const respuesta = await request(app)
      .post('/api/auth/login')
      .send({ correo: 'desconocido@pda.local', contrasena: 'cualquiera' });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.mensaje).toBe('Credenciales invalidas');
  });

  test('impide el acceso a una cuenta suspendida', async () => {
    repositorio.buscarUsuarioPorCorreo.mockResolvedValue({ ...usuarioActivo, estado: 'Suspendido' });

    const respuesta = await request(app)
      .post('/api/auth/login')
      .send({ correo: 'direccion@pda.local', contrasena: 'Pda2026*admin' });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.mensaje).toMatch(/inactiva o suspendida/i);
  });

  test('exige correo y contrasena', async () => {
    const respuesta = await request(app).post('/api/auth/login').send({ correo: 'x@pda.local' });
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('DATOS_INCOMPLETOS');
  });
});

describe('control de acceso por rol', () => {
  const autenticar = async (contrasena = 'Pda2026*admin', usuario = usuarioActivo) => {
    repositorio.buscarUsuarioPorCorreo.mockResolvedValue(usuario);
    const { body } = await request(app)
      .post('/api/auth/login')
      .send({ correo: usuario.correo_electronico, contrasena });
    return body.token;
  };

  test('el perfil requiere un token de sesion', async () => {
    const respuesta = await request(app).get('/api/auth/perfil');
    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('NO_AUTORIZADO');
  });

  test('el perfil responde con el token emitido al iniciar sesion', async () => {
    const token = await autenticar();
    repositorio.buscarUsuarioPorId.mockResolvedValue({
      id_usuario: 1, nombre_completo: 'Thelma Aguilar', nombre_rol: 'Administrador',
    });

    const respuesta = await request(app)
      .get('/api/auth/perfil')
      .set('Authorization', `Bearer ${token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.nombre_completo).toBe('Thelma Aguilar');
  });

  test('un token manipulado se rechaza', async () => {
    const respuesta = await request(app)
      .get('/api/auth/perfil')
      .set('Authorization', 'Bearer token.falsificado.aqui');
    expect(respuesta.status).toBe(401);
  });

  test('el listado de usuarios esta reservado al rol Administrador', async () => {
    const docente = {
      ...usuarioActivo,
      id_usuario: 2,
      correo_electronico: 'docente@pda.local',
      nombre_rol: 'Docente',
      contrasena_hash: bcrypt.hashSync('Pda2026*docente', 4),
    };
    const token = await autenticar('Pda2026*docente', docente);

    const respuesta = await request(app)
      .get('/api/auth/usuarios')
      .set('Authorization', `Bearer ${token}`);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe('PROHIBIDO');
  });
});
