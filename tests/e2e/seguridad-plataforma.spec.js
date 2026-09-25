'use strict';

const { test, expect } = require('@playwright/test');
const apoyo = require('./apoyo');

/* ===========================================================================
   PRUEBAS DE SEGURIDAD

   Se ejecutan contra el despliegue real, no contra dobles, porque parte de lo
   que se comprueba depende de la configuracion del entorno: las cabeceras que
   emite el proceso, el rechazo de tokens de otra procedencia y el hecho de que
   ningun dato sensible salga en las respuestas.

   Ambito: RNF-015 (autenticacion), RNF-016 (contrasenas cifradas), RNF-017
   (datos de tarjeta fuera de la plataforma), RNF-018 (bitacora de auditoria),
   RNF-020 (cierre de sesion por inactividad).
   =========================================================================== */

test.describe('CP-SEG01 cabeceras de proteccion', () => {

  test('la respuesta no revela la tecnologia del servidor', async ({ request }) => {
    const respuesta = await request.get('/health');
    const cabeceras = respuesta.headers();

    expect(cabeceras['x-powered-by']).toBeUndefined();
    expect(cabeceras['content-security-policy']).toContain("default-src 'self'");
    expect(cabeceras['x-content-type-options']).toBe('nosniff');
    expect(cabeceras['x-frame-options']).toBe('SAMEORIGIN');
  });
});

test.describe('CP-SEG02 autenticacion', () => {

  test('la contrasena nunca vuelve en la respuesta ni viaja en la URL', async ({ request }) => {
    const respuesta = await request.post('/api/auth/login', {
      data: apoyo.CREDENCIALES.administrador,
    });

    expect(respuesta.status()).toBe(200);
    const texto = await respuesta.text();
    expect(texto).not.toContain(apoyo.CREDENCIALES.administrador.contrasena);
    expect(texto).not.toMatch(/contrasena_hash|\$2[aby]\$/);
    expect(respuesta.url()).not.toContain('contrasena');
  });

  test('un correo inexistente y una contrasena incorrecta dan la misma respuesta', async ({ request }) => {
    const inexistente = await request.post('/api/auth/login', {
      data: { correo: 'nadie@pda.local', contrasena: 'cualquiera' },
    });
    const incorrecta = await request.post('/api/auth/login', {
      data: { correo: apoyo.CREDENCIALES.administrador.correo, contrasena: 'incorrecta' },
    });

    expect(inexistente.status()).toBe(incorrecta.status());
    expect(await inexistente.json()).toEqual(await incorrecta.json());
  });

  test('el token de sesion declara caducidad', async ({ request }) => {
    const { token } = await apoyo.iniciarSesion(request, 'administrador');
    const contenido = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));

    expect(contenido.exp).toBeGreaterThan(contenido.iat);
    expect(contenido.exp - contenido.iat).toBeLessThanOrEqual(60 * 60);
    expect(contenido).not.toHaveProperty('contrasena');
  });

  test('un token firmado con otro secreto no abre ninguna puerta', async ({ request }) => {
    const falsificado = [
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ sub: 1, rol: 'Administrador' })).toString('base64url'),
      'firma-inventada',
    ].join('.');

    const respuesta = await request.get('/api/auth/usuarios', {
      headers: { Authorization: `Bearer ${falsificado}` },
    });

    expect(respuesta.status()).toBe(401);
  });

  test('alterar un caracter de un token legitimo lo invalida', async ({ request }) => {
    const { token } = await apoyo.iniciarSesion(request, 'administrador');
    const alterado = `${token.slice(0, -2)}${token.slice(-2) === 'AA' ? 'BB' : 'AA'}`;

    const respuesta = await request.get('/api/auth/perfil', {
      headers: { Authorization: `Bearer ${alterado}` },
    });

    expect(respuesta.status()).toBe(401);
  });
});

test.describe('CP-SEG03 autorizacion por rol', () => {

  const protegidas = [
    ['GET', '/api/auth/usuarios'],
    ['GET', '/api/inscripcion/solicitudes'],
    ['GET', '/api/pagos/mensualidades?alumna=1'],
    ['POST', '/api/catalogo/cache/invalidar'],
  ];

  for (const [metodo, ruta] of protegidas) {
    test(`sin sesion, ${metodo} ${ruta} responde 401`, async ({ request }) => {
      const respuesta = metodo === 'GET' ? await request.get(ruta) : await request.post(ruta);
      expect(respuesta.status()).toBe(401);
    });
  }

  test('el rol Docente no accede al listado de usuarios', async ({ request }) => {
    const sesion = await apoyo.iniciarSesion(request, 'docente');
    const respuesta = await request.get('/api/auth/usuarios', { headers: sesion.cabecera });

    expect(respuesta.status()).toBe(403);
    expect((await respuesta.json()).error.codigo).toBe('PROHIBIDO');
  });

  test('el rol Encargado no puede aceptar una solicitud ajena', async ({ request }) => {
    const sesion = await apoyo.iniciarSesion(request, 'encargado');
    const respuesta = await request.post('/api/inscripcion/solicitudes/1/aceptar', {
      headers: sesion.cabecera,
      data: { idClase: 1, idNivel: 1 },
    });

    expect(respuesta.status()).toBe(403);
  });
});

test.describe('CP-SEG04 tratamiento de la entrada', () => {

  test('una inyeccion SQL en el parametro de consulta no altera la respuesta', async ({ request }) => {
    const normal = await request.get('/api/catalogo/clases');
    const conInyeccion = await request.get("/api/catalogo/clases?disciplina=1' OR '1'='1");

    expect(conInyeccion.status()).toBeLessThan(500);
    expect((await normal.json()).clases.length).toBeGreaterThan(0);

    // La tabla sigue existiendo despues del intento.
    const despues = await request.get('/api/catalogo/disciplinas');
    expect(despues.status()).toBe(200);
  });

  test('un cuerpo que no es JSON responde 400 y no error interno', async ({ request }) => {
    const respuesta = await request.post('/api/inscripcion/solicitudes', {
      headers: { 'Content-Type': 'application/json' },
      data: '{"nombreAspirante":',
    });

    expect(respuesta.status()).toBe(400);
  });

  test('un fallo no filtra el detalle interno del motor', async ({ request }) => {
    const respuesta = await request.get('/api/pagos/99999999', {
      headers: (await apoyo.iniciarSesion(request, 'administrador')).cabecera,
    });

    const texto = await respuesta.text();
    expect(respuesta.status()).toBe(404);
    expect(texto).not.toMatch(/SELECT|pg_|relation|at line/i);
  });
});

test.describe('CP-SEG05 datos de tarjeta fuera de la plataforma', () => {

  test('el pago solo transporta un token de la pasarela, nunca un numero de tarjeta', async ({ request }) => {
    // La prueba se fabrica su propia alumna con mensualidad pendiente: si se
    // apoyara en la que dejo otra prueba, el resultado dependeria del orden de
    // ejecucion y podria quedar omitida sin que nadie lo note.
    const { sesion, mensualidad } = await apoyo.registrarAlumna(request);
    expect(mensualidad.estado).toBe('Pendiente');

    const respuesta = await request.post(`/api/pagos/mensualidades/${mensualidad.id_mensualidad}/pagar`, {
      headers: sesion.cabecera,
      data: { medioPago: 'Tarjeta', tokenTarjeta: 'tok-prueba-seguridad' },
    });

    expect(respuesta.status()).toBe(201);

    const cuerpo = await respuesta.json();
    const texto = JSON.stringify(cuerpo);

    // Ni un numero de tarjeta con formato de emisor real, ni codigo de
    // verificacion, ni campo alguno que pudiera contenerlos.
    expect(texto).not.toMatch(/\b(?:4\d{15}|5[1-5]\d{14}|3[47]\d{13})\b/);
    expect(texto).not.toMatch(/cvv|cvc|numero_tarjeta|token_tarjeta|tokenTarjeta/i);
    expect(cuerpo.pago.medio_pago).toBe('Tarjeta');
  });

  test('un medio de pago no contemplado se rechaza antes de tocar la pasarela', async ({ request }) => {
    const sesion = await apoyo.iniciarSesion(request, 'administrador');
    const respuesta = await request.post('/api/pagos/mensualidades/1/pagar', {
      headers: sesion.cabecera,
      data: { medioPago: 'Criptomoneda', tokenTarjeta: 'x' },
    });

    expect(respuesta.status()).toBe(422);
    expect((await respuesta.json()).error.codigo).toBe('MEDIO_NO_VALIDO');
  });
});
