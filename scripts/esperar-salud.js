'use strict';

/* ===========================================================================
   Espera a que un despliegue responda con la sonda de salud en verde.

   Lo usan dos consumidores: las pruebas de aceptacion antes de abrir el
   navegador, y la canalizacion despues de actualizar el servicio en staging.
   Sin esta espera, la primera peticion llega cuando el contenedor todavia no
   termina de conectar con PostgreSQL y la ejecucion falla por una causa que no
   es un defecto del sistema.

   Uso:
     node scripts/esperar-salud.js http://localhost:3000 120
   =========================================================================== */

const base = (process.argv[2] || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const segundos = Number.parseInt(process.argv[3] || '120', 10);

const dormir = (ms) => new Promise((resolver) => { setTimeout(resolver, ms); });

const principal = async () => {
  const limite = Date.now() + segundos * 1000;
  let ultimoDetalle = 'sin respuesta';

  while (Date.now() < limite) {
    try {
      const respuesta = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
      const cuerpo = await respuesta.json();
      if (respuesta.ok && cuerpo.estado === 'ok') {
        process.stdout.write(
          `[salud] ${base} responde: servicio ${cuerpo.servicio}, modulos ${cuerpo.modulos.join(', ')}\n`
        );
        return;
      }
      ultimoDetalle = `codigo ${respuesta.status}, estado ${cuerpo.estado}, `
        + `dependencias ${JSON.stringify(cuerpo.dependencias || {})}`;
    } catch (err) {
      ultimoDetalle = err.message;
    }
    await dormir(3000);
  }

  process.stderr.write(`[salud] ${base} no quedo en verde en ${segundos}s. Ultimo detalle: ${ultimoDetalle}\n`);
  process.exit(1);
};

principal();
