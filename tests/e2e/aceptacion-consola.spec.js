'use strict';

const { test, expect } = require('@playwright/test');
const apoyo = require('./apoyo');

/* ===========================================================================
   PRUEBAS DE ACEPTACION

   Reproducen en el navegador lo que hara una persona el dia de la puesta en
   marcha: la encargada de una aspirante envia la solicitud desde la consola, y
   la direccion la acepta, asigna la clase y cobra la mensualidad. El criterio
   de aceptacion es el enunciado de la historia de usuario, no el contrato HTTP.
   =========================================================================== */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('estado-salud')).toContainText('en linea', { timeout: 20_000 });
});

test.describe('HU-013 consultar la oferta academica sin registrarse', () => {

  test('la pantalla abre mostrando disciplinas y clases con su cupo', async ({ page }) => {
    await expect(page.getByTestId('tabla-disciplinas').locator('tbody tr')).not.toHaveCount(0);
    await expect(page.getByTestId('tabla-clases').locator('tbody tr')).not.toHaveCount(0);
    await expect(page.getByTestId('estado-sesion')).toHaveText('Sin sesion');

    const primeraClase = page.getByTestId('tabla-clases').locator('tbody tr').first();
    await expect(primeraClase.locator('td').nth(4)).toContainText(':');
  });

  test('la consulta se resuelve desde la cache al repetirse', async ({ page }) => {
    await page.getByTestId('btn-cargar-catalogo').click();
    await expect(page.getByTestId('origen-catalogo')).toContainText('cache');
  });
});

test.describe('HU-014 enviar una solicitud de inscripcion', () => {

  test('la solicitud con datos completos queda recibida', async ({ page }) => {
    const sufijo = apoyo.marca();

    await page.getByTestId('tab-solicitud').click();
    await page.getByTestId('campo-nombre-aspirante').fill(`Sofia Prueba ${sufijo}`);
    await page.getByTestId('campo-fecha-nacimiento').fill(apoyo.fechaParaEdad(10));
    await page.getByTestId('campo-disciplina').selectOption({ label: 'Ballet clasico' });
    await page.getByTestId('campo-nombre-encargado').fill(`Ana Prueba ${sufijo}`);
    await page.getByTestId('campo-correo').fill(`ana.${sufijo}@pda.local`);
    await page.getByTestId('campo-telefono').fill('5555-9999');
    await page.getByTestId('btn-enviar-solicitud').click();

    const resultado = page.getByTestId('resultado-solicitud');
    await expect(resultado).toBeVisible();
    await expect(resultado).toContainText('recibida');
    await expect(resultado).toContainText('Recibida');
    await expect(resultado).toHaveClass(/exito/);
  });

  test('la solicitud incompleta enumera los campos que faltan', async ({ page }) => {
    await page.getByTestId('tab-solicitud').click();
    await page.getByTestId('campo-nombre-aspirante').fill('Sin fecha de nacimiento');
    await page.getByTestId('btn-enviar-solicitud').click();

    const resultado = page.getByTestId('resultado-solicitud');
    await expect(resultado).toHaveClass(/fallo/);
    await expect(resultado).toContainText('Faltan datos obligatorios');
    await expect(resultado).toContainText('fecha de nacimiento');
  });

  test('una aspirante menor que la edad minima recibe el motivo del rechazo', async ({ page }) => {
    await page.getByTestId('tab-solicitud').click();
    await page.getByTestId('campo-nombre-aspirante').fill('Aspirante muy pequena');
    await page.getByTestId('campo-fecha-nacimiento').fill(apoyo.fechaParaEdad(2));
    await page.getByTestId('campo-disciplina').selectOption({ label: 'Ballet clasico' });
    await page.getByTestId('campo-nombre-encargado').fill('Encargado de prueba');
    await page.getByTestId('btn-enviar-solicitud').click();

    const resultado = page.getByTestId('resultado-solicitud');
    await expect(resultado).toHaveClass(/fallo/);
    await expect(resultado).toContainText('edad minima');
  });
});

test.describe('HU-002 control de acceso desde la consola', () => {

  test('las credenciales correctas muestran el nombre y el rol de quien entra', async ({ page }) => {
    await page.getByTestId('tab-direccion').click();
    await page.getByTestId('campo-correo-sesion').fill(apoyo.CREDENCIALES.administrador.correo);
    await page.getByTestId('campo-contrasena').fill(apoyo.CREDENCIALES.administrador.contrasena);
    await page.getByTestId('btn-iniciar-sesion').click();

    await expect(page.getByTestId('estado-sesion')).toContainText('Administrador');
    await expect(page.getByTestId('resultado-sesion')).toHaveClass(/exito/);
  });

  test('una contrasena incorrecta no abre sesion ni revela si el correo existe', async ({ page }) => {
    await page.getByTestId('tab-direccion').click();
    await page.getByTestId('campo-correo-sesion').fill(apoyo.CREDENCIALES.administrador.correo);
    await page.getByTestId('campo-contrasena').fill('contrasena-equivocada');
    await page.getByTestId('btn-iniciar-sesion').click();

    await expect(page.getByTestId('resultado-sesion')).toHaveClass(/fallo/);
    await expect(page.getByTestId('resultado-sesion')).toHaveText('Credenciales invalidas');
    await expect(page.getByTestId('estado-sesion')).toHaveText('Sin sesion');
  });

  test('el rol Docente no puede resolver solicitudes', async ({ page }) => {
    await page.getByTestId('tab-direccion').click();
    await page.getByTestId('campo-correo-sesion').fill(apoyo.CREDENCIALES.docente.correo);
    await page.getByTestId('campo-contrasena').fill(apoyo.CREDENCIALES.docente.contrasena);
    await page.getByTestId('btn-iniciar-sesion').click();
    await expect(page.getByTestId('estado-sesion')).toContainText('Docente');

    await page.getByTestId('campo-id-solicitud').fill('1');
    await page.getByTestId('btn-aceptar').click();

    await expect(page.getByTestId('resultado-resolucion')).toHaveClass(/fallo/);
    await expect(page.getByTestId('resultado-resolucion')).toContainText('permisos');
  });
});

test.describe('HU-015 y HU-021 recorrido completo de la direccion', () => {

  test('aceptar una solicitud registra a la alumna, la asigna y deja lista su mensualidad', async ({ page }) => {
    const sufijo = apoyo.marca();

    // --- La encargada envia la solicitud ------------------------------------
    await page.getByTestId('tab-solicitud').click();
    await page.getByTestId('campo-nombre-aspirante').fill(`Valeria Prueba ${sufijo}`);
    await page.getByTestId('campo-fecha-nacimiento').fill(apoyo.fechaParaEdad(12));
    await page.getByTestId('campo-disciplina').selectOption({ label: 'Ballet clasico' });
    await page.getByTestId('campo-nombre-encargado').fill(`Carla Prueba ${sufijo}`);
    await page.getByTestId('campo-correo').fill(`carla.${sufijo}@pda.local`);
    await page.getByTestId('btn-enviar-solicitud').click();
    await expect(page.getByTestId('resultado-solicitud')).toHaveClass(/exito/);

    // --- La direccion entra y la encuentra en su bandeja ---------------------
    await page.getByTestId('tab-direccion').click();
    await page.getByTestId('campo-correo-sesion').fill(apoyo.CREDENCIALES.administrador.correo);
    await page.getByTestId('campo-contrasena').fill(apoyo.CREDENCIALES.administrador.contrasena);
    await page.getByTestId('btn-iniciar-sesion').click();
    await expect(page.getByTestId('estado-sesion')).toContainText('Administrador');

    const idSolicitud = await page.getByTestId('campo-id-solicitud').inputValue();
    expect(Number(idSolicitud)).toBeGreaterThan(0);

    await page.getByTestId('btn-cargar-solicitudes').click();
    await expect(
      page.getByTestId('tabla-solicitudes').locator(`tbody tr[data-fila="${idSolicitud}"]`)
    ).toContainText(`Valeria Prueba ${sufijo}`);

    // --- Acepta y asigna clase y nivel de la misma disciplina ----------------
    // Se elige la clase de Ballet con mas espacios libres: asi la prueba puede
    // repetirse muchas veces sobre el mismo entorno sin chocar con el cupo.
    const valorClase = await page.getByTestId('campo-clase').evaluate((select) => {
      const candidatas = Array.from(select.options)
        .map((opcion) => ({
          valor: opcion.value,
          libres: Number((opcion.textContent.match(/(\d+) libres/) || [0, 0])[1]),
          disciplina: opcion.textContent,
        }))
        .filter((o) => o.disciplina.includes('Ballet clasico') && o.libres > 0)
        .sort((a, b) => b.libres - a.libres);
      return candidatas.length > 0 ? candidatas[0].valor : null;
    });

    expect(valorClase, 'debe quedar al menos una clase de Ballet con cupo libre').not.toBeNull();
    await page.getByTestId('campo-clase').selectOption(valorClase);
    await page.getByTestId('btn-aceptar').click();

    const resolucion = page.getByTestId('resultado-resolucion');
    await expect(resolucion).toHaveClass(/exito/);
    await expect(resolucion).toContainText('registrada');
    await expect(resolucion).toContainText('docente');

    // --- La mensualidad del periodo ya existe: la genero el motor ------------
    await page.getByTestId('tab-pagos').click();
    const idAlumna = await page.getByTestId('campo-id-alumna').inputValue();
    expect(Number(idAlumna)).toBeGreaterThan(0);

    await page.getByTestId('btn-cargar-mensualidades').click();
    const filas = page.getByTestId('tabla-mensualidades').locator('tbody tr');
    await expect(filas).toHaveCount(1);
    await expect(filas.first()).toContainText('Pendiente');
    await expect(filas.first()).toContainText('Ballet clasico');

    // --- Se cobra y se emite el comprobante ----------------------------------
    await page.getByTestId('campo-medio-pago').selectOption('Tarjeta');
    await page.getByTestId('btn-pagar').click();

    const pago = page.getByTestId('resultado-pago');
    await expect(pago).toHaveClass(/exito/);
    await expect(pago).toContainText('aprobado');
    await expect(pago).toContainText('PDA-');
    await expect(pago).toContainText('Pagada');

    // --- Y la mensualidad ya no aparece pendiente ----------------------------
    await page.getByTestId('btn-cargar-mensualidades').click();
    await expect(filas.first()).toContainText('Pagada');
  });

  test('cobrar dos veces la misma mensualidad se rechaza', async ({ page, request }) => {
    // La prueba se prepara su propia alumna con mensualidad pendiente. Apoyarse
    // en la que dejo la prueba anterior haria que el resultado dependiera del
    // orden de ejecucion.
    const { idAlumna, mensualidad } = await apoyo.registrarAlumna(request);

    await page.getByTestId('tab-direccion').click();
    await page.getByTestId('campo-correo-sesion').fill(apoyo.CREDENCIALES.administrador.correo);
    await page.getByTestId('campo-contrasena').fill(apoyo.CREDENCIALES.administrador.contrasena);
    await page.getByTestId('btn-iniciar-sesion').click();
    await expect(page.getByTestId('estado-sesion')).toContainText('Administrador');

    await page.getByTestId('tab-pagos').click();
    await page.getByTestId('campo-id-alumna').fill(String(idAlumna));
    await page.getByTestId('btn-cargar-mensualidades').click();

    // Se espera a que la tabla se pueble: contar antes de que llegue la
    // respuesta daria cero y la prueba se saltaria sin haber comprobado nada.
    const filas = page.getByTestId('tabla-mensualidades').locator('tbody tr');
    await expect(filas).toHaveCount(1);
    await expect(filas.first()).toContainText('Pendiente');

    // Primer cobro: la mensualidad queda saldada.
    await page.getByTestId('campo-id-mensualidad').fill(String(mensualidad.id_mensualidad));
    await page.getByTestId('campo-medio-pago').selectOption('Efectivo');
    await page.getByTestId('btn-pagar').click();
    await expect(page.getByTestId('resultado-pago')).toHaveClass(/exito/);
    await expect(page.getByTestId('resultado-pago')).toContainText('Pagada');

    // Segundo intento sobre la misma mensualidad: la plataforma lo rechaza.
    await page.getByTestId('btn-pagar').click();
    await expect(page.getByTestId('resultado-pago')).toHaveClass(/fallo/);
    await expect(page.getByTestId('resultado-pago')).toContainText('ya fue saldada');
  });
});

test.describe('experiencia de uso comprobable de forma automatica', () => {

  test('la pantalla es utilizable en una ventana de telefono', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const anchoDocumento = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(anchoDocumento, 'la pantalla no debe desplazarse en horizontal').toBeLessThanOrEqual(400);
    await expect(page.getByTestId('tab-solicitud')).toBeVisible();
  });

  test('cada campo del formulario de solicitud tiene su etiqueta asociada', async ({ page }) => {
    await page.getByTestId('tab-solicitud').click();

    const sinEtiqueta = await page.getByTestId('formulario-solicitud').evaluate((formulario) =>
      Array.from(formulario.querySelectorAll('input, select'))
        .filter((campo) => !campo.closest('label') && !campo.labels?.length)
        .map((campo) => campo.name));

    expect(sinEtiqueta).toEqual([]);
  });

  test('la consola no deja errores en la consola del navegador', async ({ page }) => {
    const errores = [];
    page.on('console', (mensaje) => { if (mensaje.type() === 'error') errores.push(mensaje.text()); });
    page.on('pageerror', (err) => errores.push(err.message));

    await page.goto('/');
    await page.getByTestId('btn-cargar-catalogo').click();
    await expect(page.getByTestId('origen-catalogo')).not.toHaveText('');

    expect(errores).toEqual([]);
  });
});
