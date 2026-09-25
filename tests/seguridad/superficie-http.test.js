'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');

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

const db = require('../../src/core/db');
const { crearApp } = require('../../src/core/app');

const app = crearApp('monolito');

/**
 * Pruebas de seguridad automatizadas sobre la superficie HTTP (RNF-015 a
 * RNF-020). Verifican lo que debe cumplirse en toda peticion, sea cual sea el
 * modulo que la atiende: cabeceras de proteccion, control de acceso, no
 * divulgacion de detalles internos y parametrizacion de las consultas.
 */

beforeEach(() => jest.clearAllMocks());

describe('cabeceras de proteccion del navegador', () => {
  test('no revela la tecnologia del servidor en X-Powered-By', async () => {
    const respuesta = await request(app).get('/health/vivo');
    expect(respuesta.headers).not.toHaveProperty('x-powered-by');
  });

  test('declara una politica de contenido que solo admite recursos propios', async () => {
    const respuesta = await request(app).get('/health/vivo');
    expect(respuesta.headers['content-security-policy']).toMatch(/default-src 'self'/);
  });

  test('impide que la pagina se incruste en un marco ajeno', async () => {
    const respuesta = await request(app).get('/health/vivo');
    expect(respuesta.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  test('impide que el navegador adivine el tipo de contenido', async () => {
    const respuesta = await request(app).get('/health/vivo');
    expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('control de acceso', () => {
  const rutasProtegidas = [
    ['get', '/api/auth/perfil'],
    ['get', '/api/auth/usuarios'],
    ['get', '/api/inscripcion/solicitudes'],
    ['post', '/api/inscripcion/solicitudes/1/aceptar'],
    ['get', '/api/pagos/mensualidades'],
    ['post', '/api/catalogo/cache/invalidar'],
  ];

  test.each(rutasProtegidas)(
    'la ruta %s %s exige token de sesion',
    async (metodo, ruta) => {
      const respuesta = await request(app)[metodo](ruta);
      expect(respuesta.status).toBe(401);
      expect(respuesta.body.error.codigo).toBe('NO_AUTORIZADO');
    }
  );

  test('rechaza un token firmado con un secreto distinto', async () => {
    const falsificado = jwt.sign({ sub: 1, rol: 'Administrador' }, 'secreto-del-atacante');
    const respuesta = await request(app)
      .get('/api/auth/usuarios')
      .set('Authorization', `Bearer ${falsificado}`);

    expect(respuesta.status).toBe(401);
  });

  test('un token valido de Docente no alcanza una ruta de Administrador', async () => {
    const docente = jwt.sign({ sub: 2, rol: 'Docente' }, process.env.JWT_SECRET);
    const respuesta = await request(app)
      .get('/api/auth/usuarios')
      .set('Authorization', `Bearer ${docente}`);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe('PROHIBIDO');
  });

  test('el catalogo se consulta sin sesion: es la unica lectura publica', async () => {
    const respuesta = await request(app).get('/api/catalogo/disciplinas');
    expect(respuesta.status).toBe(200);
  });
});

describe('no divulgacion de detalles internos', () => {
  test('un fallo inesperado responde 500 sin filtrar el mensaje del motor', async () => {
    db.consultar.mockRejectedValueOnce(new Error('relation "usuario" does not exist at line 3'));

    const respuesta = await request(app).get('/api/catalogo/disciplinas');

    expect(respuesta.status).toBe(500);
    expect(respuesta.body.error.mensaje).toBe('Error interno del servidor');
    expect(JSON.stringify(respuesta.body)).not.toMatch(/relation|line 3/);
  });

  test('una ruta inexistente responde 404 con el formato de error de la plataforma', async () => {
    const respuesta = await request(app).get('/api/catalogo/inexistente');

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  test.each(['/package.json', '/.env', '/src/core/config.js'])(
    'el servidor de archivos estaticos no entrega %s',
    async (ruta) => {
      const respuesta = await request(app).get(ruta);

      expect(respuesta.status).toBe(404);
      expect(respuesta.text).not.toMatch(/JWT_SECRET|dependencies/);
    }
  );
});

describe('tratamiento de la entrada no confiable', () => {
  test('una inyeccion en el parametro de consulta nunca se concatena al SQL', async () => {
    await request(app).get('/api/catalogo/clases?disciplina=1;DROP%20TABLE%20usuario');

    const [texto, parametros] = db.consultar.mock.calls[0];
    expect(texto).not.toMatch(/DROP TABLE/i);
    expect(texto).toMatch(/\$1/);
    expect(parametros.some((p) => String(p).includes('DROP'))).toBe(false);
  });

  test('un identificador valido llega a la consulta como parametro numerico', async () => {
    await request(app).get('/api/catalogo/clases?disciplina=2&nivel=5');

    const [, parametros] = db.consultar.mock.calls[0];
    expect(parametros).toEqual([2, 5]);
  });

  test('rechaza un cuerpo que supera el limite de un megabyte', async () => {
    const respuesta = await request(app)
      .post('/api/inscripcion/solicitudes')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ nombreAspirante: 'A'.repeat(1024 * 1024 + 64) }));

    expect(respuesta.status).toBe(413);
  });

  test('un cuerpo que no es JSON valido responde 400 y no error interno', async () => {
    const respuesta = await request(app)
      .post('/api/inscripcion/solicitudes')
      .set('Content-Type', 'application/json')
      .send('{"nombreAspirante": ');

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('JSON_INVALIDO');
  });

  test('el inicio de sesion no revela si el correo existe', async () => {
    db.consultar.mockResolvedValueOnce({ rows: [] });

    const respuesta = await request(app)
      .post('/api/auth/login')
      .send({ correo: 'nadie@pda.local', contrasena: 'cualquiera' });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.mensaje).toBe('Credenciales invalidas');
  });
});
