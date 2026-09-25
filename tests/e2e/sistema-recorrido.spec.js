'use strict';

const { test, expect } = require('@playwright/test');
const apoyo = require('./apoyo');

/* ===========================================================================
   PRUEBAS DE SISTEMA

   Ejercitan el recorrido completo contra la plataforma desplegada, con la base
   de datos real y sus disparadores. Lo que aqui se comprueba no puede
   comprobarse con dobles: la generacion automatica de la mensualidad y el
   rechazo del cupo excedido ocurren dentro del motor, no en el codigo.

   Requisito previo: el entorno levantado y BASE_URL apuntando a el.
   =========================================================================== */

test.describe('CP-S01 disponibilidad de la plataforma', () => {

  test('la sonda de salud reporta los cuatro modulos y sus dependencias en verde', async ({ request }) => {
    const respuesta = await request.get('/health');
    expect(respuesta.status()).toBe(200);

    const cuerpo = await respuesta.json();
    expect(cuerpo.estado).toBe('ok');
    expect(cuerpo.modulos.sort()).toEqual(['auth', 'catalogo', 'inscripcion', 'pagos']);
    expect(cuerpo.dependencias.postgres).toBe('ok');
    expect(cuerpo.dependencias.redis).toBe('ok');
  });

  test('la consola operativa se entrega desde la misma direccion', async ({ request }) => {
    const respuesta = await request.get('/');
    expect(respuesta.status()).toBe(200);
    expect(await respuesta.text()).toContain('Perfect Dance Academy');
  });
});

test.describe('CP-S02 catalogo academico', () => {

  test('la primera consulta lee de la base y la siguiente responde desde la cache', async ({ request }) => {
    const sesion = await apoyo.iniciarSesion(request, 'administrador');
    await request.post('/api/catalogo/cache/invalidar', { headers: sesion.cabecera });

    const primera = await (await request.get('/api/catalogo/disciplinas')).json();
    const segunda = await (await request.get('/api/catalogo/disciplinas')).json();

    expect(primera.origen).toBe('base_de_datos');
    expect(segunda.origen).toBe('cache');
    expect(segunda.disciplinas).toEqual(primera.disciplinas);
  });

  test('cada clase publica su horario, su docente y su cupo disponible', async ({ request }) => {
    const { clases } = await apoyo.catalogo(request);

    expect(clases.length).toBeGreaterThan(0);
    clases.forEach((clase) => {
      expect(clase).toMatchObject({
        id_clase: expect.any(Number),
        disciplina: expect.any(String),
        nivel: expect.any(String),
        dia_semana: expect.any(String),
      });
      expect(clase.cupo_disponible).toBeLessThanOrEqual(clase.cupo_maximo);
    });
  });

  test('una disciplina inexistente responde 404 y no una lista vacia', async ({ request }) => {
    const respuesta = await request.get('/api/catalogo/disciplinas/9999/niveles');

    expect(respuesta.status()).toBe(404);
    expect((await respuesta.json()).error.codigo).toBe('NO_ENCONTRADO');
  });
});

test.describe('CP-S03 recorrido de inscripcion, registro y pago', () => {

  test('de la solicitud al comprobante en una sola cadena', async ({ request }) => {
    const sufijo = apoyo.marca();
    const { disciplinas, clases } = await apoyo.catalogo(request);
    const disciplina = disciplinas.find((d) => d.nombre === 'Ballet clasico') || disciplinas[0];
    const clase = apoyo.claseConMasCupo(clases, disciplina.id_disciplina);
    expect(clase, 'la disciplina elegida debe tener al menos una clase con cupo').toBeTruthy();

    // --- 1. La aspirante envia su solicitud, sin sesion -----------------------
    const { respuesta: envio, cuerpo: enviada } = await apoyo.crearSolicitud(request, {
      idDisciplina: disciplina.id_disciplina,
      edad: Math.max(disciplina.edad_minima ?? 6, 6),
      sufijo,
    });
    expect(envio.status()).toBe(201);
    expect(enviada.solicitud.estado).toBe('Recibida');
    const idSolicitud = enviada.solicitud.id_solicitud;

    // --- 2. La direccion inicia sesion y la ve en su bandeja -----------------
    const sesion = await apoyo.iniciarSesion(request, 'administrador');
    const bandeja = await (await request.get('/api/inscripcion/solicitudes?estado=Recibida', {
      headers: sesion.cabecera,
    })).json();
    expect(bandeja.solicitudes.map((s) => s.id_solicitud)).toContain(idSolicitud);

    // --- 3. Al aceptar se registra la alumna y se le asigna clase y horario ---
    const niveles = await apoyo.nivelesDe(request, disciplina.id_disciplina);
    const nivel = niveles.find((n) => n.id_nivel === clase.id_nivel) || niveles[0];

    const aceptacion = await request.post(`/api/inscripcion/solicitudes/${idSolicitud}/aceptar`, {
      headers: sesion.cabecera,
      data: { idClase: clase.id_clase, idNivel: nivel.id_nivel },
    });
    expect(aceptacion.status()).toBe(201);

    const registro = await aceptacion.json();
    expect(registro.solicitud.estado).toBe('Aceptada');
    expect(registro.asignacion.idClase).toBe(clase.id_clase);
    expect(registro.asignacion.diaSemana).toBe(clase.dia_semana);
    expect(registro.asignacion.docente).toBeTruthy();
    const idAlumna = registro.alumna.id_alumna;

    // --- 4. El motor genero la mensualidad del periodo en curso --------------
    const mensualidades = await (await request.get(`/api/pagos/mensualidades?alumna=${idAlumna}`, {
      headers: sesion.cabecera,
    })).json();

    expect(mensualidades.mensualidades.length).toBe(1);
    const mensualidad = mensualidades.mensualidades[0];
    expect(mensualidad.estado).toBe('Pendiente');
    expect(Number(mensualidad.monto)).toBe(Number(disciplina.monto_mensualidad));
    expect(mensualidad.periodo_mes).toBe(new Date().getMonth() + 1);

    // --- 5. Se paga y se emite el comprobante -------------------------------
    const pago = await request.post(`/api/pagos/mensualidades/${mensualidad.id_mensualidad}/pagar`, {
      headers: sesion.cabecera,
      data: { medioPago: 'Tarjeta', tokenTarjeta: `tok-prueba-${sufijo}` },
    });
    expect(pago.status()).toBe(201);

    const resultado = await pago.json();
    expect(resultado.aprobado).toBe(true);
    expect(resultado.mensualidad.estado).toBe('Pagada');
    expect(resultado.comprobante.numero_correlativo).toMatch(/^PDA-\d{8}$/);

    // --- 6. El cupo de la clase bajo en uno ---------------------------------
    const despues = await apoyo.catalogo(request);
    const claseDespues = despues.clases.find((c) => c.id_clase === clase.id_clase);
    expect(claseDespues.cupo_disponible).toBe(clase.cupo_disponible - 1);
  });

  test('una segunda aceptacion de la misma solicitud responde 409', async ({ request }) => {
    const { disciplinas, clases } = await apoyo.catalogo(request);
    const disciplina = disciplinas[0];
    const clase = apoyo.claseConMasCupo(clases, disciplina.id_disciplina);
    const niveles = await apoyo.nivelesDe(request, disciplina.id_disciplina);
    const sesion = await apoyo.iniciarSesion(request, 'administrador');

    const { cuerpo } = await apoyo.crearSolicitud(request, {
      idDisciplina: disciplina.id_disciplina,
      edad: Math.max(disciplina.edad_minima ?? 6, 6),
    });
    const id = cuerpo.solicitud.id_solicitud;
    const cuerpoAceptacion = { idClase: clase.id_clase, idNivel: niveles[0].id_nivel };

    const primera = await request.post(`/api/inscripcion/solicitudes/${id}/aceptar`, {
      headers: sesion.cabecera, data: cuerpoAceptacion,
    });
    const segunda = await request.post(`/api/inscripcion/solicitudes/${id}/aceptar`, {
      headers: sesion.cabecera, data: cuerpoAceptacion,
    });

    expect(primera.status()).toBe(201);
    expect(segunda.status()).toBe(409);
    expect((await segunda.json()).error.codigo).toBe('CONFLICTO');
  });

  test('una aspirante fuera del rango de edad no genera solicitud', async ({ request }) => {
    const { disciplinas } = await apoyo.catalogo(request);
    const disciplina = disciplinas.find((d) => d.edad_minima !== null);

    const { respuesta, cuerpo } = await apoyo.crearSolicitud(request, {
      idDisciplina: disciplina.id_disciplina,
      edad: Math.max(disciplina.edad_minima - 2, 1),
    });

    expect(respuesta.status()).toBe(422);
    expect(cuerpo.error.codigo).toBe('EDAD_FUERA_DE_RANGO');
  });

  test('una clase de otra disciplina no puede asignarse a la solicitud', async ({ request }) => {
    const { disciplinas, clases } = await apoyo.catalogo(request);
    const disciplina = disciplinas[0];
    const otra = clases.find((c) => c.id_disciplina !== disciplina.id_disciplina && c.cupo_disponible > 0);
    const niveles = await apoyo.nivelesDe(request, disciplina.id_disciplina);
    const sesion = await apoyo.iniciarSesion(request, 'administrador');

    const { cuerpo } = await apoyo.crearSolicitud(request, {
      idDisciplina: disciplina.id_disciplina,
      edad: Math.max(disciplina.edad_minima ?? 6, 6),
    });

    const respuesta = await request.post(
      `/api/inscripcion/solicitudes/${cuerpo.solicitud.id_solicitud}/aceptar`,
      { headers: sesion.cabecera, data: { idClase: otra.id_clase, idNivel: niveles[0].id_nivel } }
    );

    expect(respuesta.status()).toBe(422);
    expect((await respuesta.json()).error.codigo).toBe('CLASE_INCOMPATIBLE');
  });
});

test.describe('CP-S04 reglas impuestas en el motor de base de datos', () => {

  test('el cupo maximo de una clase no puede excederse por ninguna via', async ({ request }) => {
    test.slow();

    const { disciplinas, clases } = await apoyo.catalogo(request);
    const candidata = clases
      .filter((c) => c.cupo_disponible > 0)
      .sort((a, b) => a.cupo_disponible - b.cupo_disponible)[0];

    // Sin cupo en ninguna clase no hay nada que comprobar. Es lo que ocurre al
    // repetir la bateria varias veces sobre el mismo entorno sin reiniciarlo;
    // en la canalizacion la base siempre nace limpia y el caso siempre corre.
    test.skip(
      !candidata,
      'ninguna clase tiene cupo libre; ejecutar "npm run datos:reiniciar"'
    );
    test.skip(
      candidata.cupo_disponible > 20,
      `la clase con menos cupo tiene ${candidata.cupo_disponible} espacios libres; `
      + 'ejecutar "npm run datos:reiniciar" para dejar el entorno en su estado inicial'
    );

    const disciplina = disciplinas.find((d) => d.id_disciplina === candidata.id_disciplina);
    const niveles = await apoyo.nivelesDe(request, disciplina.id_disciplina);
    const nivel = niveles.find((n) => n.id_nivel === candidata.id_nivel) || niveles[0];
    const sesion = await apoyo.iniciarSesion(request, 'administrador');
    const edad = Math.max(disciplina.edad_minima ?? 6, 6);

    const ocupar = async () => {
      const { cuerpo } = await apoyo.crearSolicitud(request, {
        idDisciplina: disciplina.id_disciplina, edad,
      });
      return request.post(`/api/inscripcion/solicitudes/${cuerpo.solicitud.id_solicitud}/aceptar`, {
        headers: sesion.cabecera,
        data: { idClase: candidata.id_clase, idNivel: nivel.id_nivel },
      });
    };

    // Se ocupan todos los espacios libres que quedan en la clase.
    for (let i = 0; i < candidata.cupo_disponible; i += 1) {
      expect((await ocupar()).status()).toBe(201);
    }

    // El siguiente registro debe rechazarse: el motor no admite un espacio mas.
    const excedente = await ocupar();
    expect(excedente.status()).toBe(409);
    expect((await excedente.json()).error.codigo).toBe('CONFLICTO');

    const despues = await apoyo.catalogo(request);
    expect(despues.clases.find((c) => c.id_clase === candidata.id_clase).cupo_disponible).toBe(0);
  });
});
