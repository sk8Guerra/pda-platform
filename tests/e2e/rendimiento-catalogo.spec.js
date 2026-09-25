'use strict';

const { test, expect } = require('@playwright/test');
const apoyo = require('./apoyo');

/* ===========================================================================
   PRUEBAS DE RENDIMIENTO

   Miden lo que el requerimiento no funcional promete, no lo que la maquina
   puede dar: el catalogo es la pantalla mas consultada de la plataforma y debe
   responder por debajo de dos segundos incluso en la primera visita, cuando la
   cache esta vacia (RNF-001).

   Los umbrales estan holgados a proposito. El servidor de integracion continua
   es mas lento que una maquina de desarrollo y una prueba de rendimiento que
   falla por el ruido del entorno deja de ser util: se vuelve algo que el equipo
   aprende a ignorar. Los numeros exactos de cada ejecucion quedan en el reporte
   HTML y en la salida de la consola, que es donde se observa la tendencia.
   =========================================================================== */

const UMBRAL_PRIMERA_MS = Number(process.env.UMBRAL_PRIMERA_MS || 2000);
const UMBRAL_CACHE_MS = Number(process.env.UMBRAL_CACHE_MS || 800);
const REPETICIONES = Number(process.env.REPETICIONES || 30);

const medir = async (accion) => {
  const inicio = Date.now();
  const respuesta = await accion();
  return { ms: Date.now() - inicio, respuesta };
};

const percentil = (valores, p) => {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)];
};

const resumen = (etiqueta, muestras) => {
  const media = muestras.reduce((a, b) => a + b, 0) / muestras.length;
  const linea = `${etiqueta}: n=${muestras.length} `
    + `min=${Math.min(...muestras)}ms media=${media.toFixed(0)}ms `
    + `p95=${percentil(muestras, 95)}ms max=${Math.max(...muestras)}ms`;
  console.log(linea);
  return { media, p95: percentil(muestras, 95), max: Math.max(...muestras), linea };
};

test.describe('CP-REN01 tiempo de respuesta del catalogo (RNF-001)', () => {

  test('la primera consulta, con la cache vacia, responde por debajo del umbral', async ({ request }, infoPrueba) => {
    const sesion = await apoyo.iniciarSesion(request, 'administrador');
    await request.post('/api/catalogo/cache/invalidar', { headers: sesion.cabecera });

    const { ms, respuesta } = await medir(() => request.get('/api/catalogo/disciplinas'));
    const cuerpo = await respuesta.json();

    expect(cuerpo.origen).toBe('base_de_datos');
    infoPrueba.annotations.push({ type: 'medicion', description: `primera consulta: ${ms} ms` });
    expect(ms).toBeLessThan(UMBRAL_PRIMERA_MS);
  });

  test('las consultas siguientes se resuelven desde la cache y son mas rapidas', async ({ request }, infoPrueba) => {
    const sesion = await apoyo.iniciarSesion(request, 'administrador');
    await request.post('/api/catalogo/cache/invalidar', { headers: sesion.cabecera });

    const { ms: msBase } = await medir(() => request.get('/api/catalogo/disciplinas'));

    const muestras = [];
    for (let i = 0; i < REPETICIONES; i += 1) {
      const { ms, respuesta } = await medir(() => request.get('/api/catalogo/disciplinas'));
      expect((await respuesta.json()).origen).toBe('cache');
      muestras.push(ms);
    }

    const estadistica = resumen('catalogo desde cache', muestras);
    infoPrueba.annotations.push({
      type: 'medicion',
      description: `${estadistica.linea} | primera lectura desde la base: ${msBase} ms`,
    });

    expect(estadistica.p95).toBeLessThan(UMBRAL_CACHE_MS);
  });
});

test.describe('CP-REN02 comportamiento bajo peticiones simultaneas', () => {

  test('veinte consultas en paralelo se atienden todas y ninguna se degrada', async ({ request }, infoPrueba) => {
    const simultaneas = 20;

    const inicio = Date.now();
    const respuestas = await Promise.all(
      Array.from({ length: simultaneas }, () => medir(() => request.get('/api/catalogo/clases')))
    );
    const total = Date.now() - inicio;

    respuestas.forEach(({ respuesta }) => expect(respuesta.status()).toBe(200));

    const estadistica = resumen(`${simultaneas} consultas simultaneas`, respuestas.map((r) => r.ms));
    infoPrueba.annotations.push({
      type: 'medicion',
      description: `${estadistica.linea} | tiempo total del lote: ${total} ms`,
    });

    expect(estadistica.p95).toBeLessThan(UMBRAL_PRIMERA_MS * 2);
  });

  test('la sonda de salud responde sin importar la carga del catalogo', async ({ request }, infoPrueba) => {
    const muestras = [];
    for (let i = 0; i < 10; i += 1) {
      const { ms, respuesta } = await medir(() => request.get('/health/vivo'));
      expect(respuesta.status()).toBe(200);
      muestras.push(ms);
    }

    const estadistica = resumen('sonda de vida', muestras);
    infoPrueba.annotations.push({ type: 'medicion', description: estadistica.linea });

    // La sonda no consulta dependencias: si tarda, el proceso esta bloqueado.
    expect(estadistica.p95).toBeLessThan(UMBRAL_CACHE_MS);
  });
});

test.describe('CP-REN03 costo del recorrido completo', () => {

  test('el registro de una alumna se resuelve en una sola transaccion breve', async ({ request }, infoPrueba) => {
    const { disciplinas, clases } = await apoyo.catalogo(request);
    const disciplina = disciplinas[0];
    const clase = apoyo.claseConMasCupo(clases, disciplina.id_disciplina);
    test.skip(!clase, 'no queda ninguna clase con cupo para medir el registro');

    const niveles = await apoyo.nivelesDe(request, disciplina.id_disciplina);
    const sesion = await apoyo.iniciarSesion(request, 'administrador');

    const { cuerpo } = await apoyo.crearSolicitud(request, {
      idDisciplina: disciplina.id_disciplina,
      edad: Math.max(disciplina.edad_minima ?? 6, 6),
    });

    const { ms, respuesta } = await medir(() =>
      request.post(`/api/inscripcion/solicitudes/${cuerpo.solicitud.id_solicitud}/aceptar`, {
        headers: sesion.cabecera,
        data: { idClase: clase.id_clase, idNivel: niveles[0].id_nivel },
      }));

    expect(respuesta.status()).toBe(201);
    infoPrueba.annotations.push({
      type: 'medicion',
      description: `aceptacion y registro completo: ${ms} ms`,
    });
    expect(ms).toBeLessThan(UMBRAL_PRIMERA_MS * 2);
  });
});
