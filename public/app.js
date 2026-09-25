'use strict';

/* ===========================================================================
   Consola operativa de Perfect Dance Academy.

   Cliente ligero sin dependencias externas: consume la misma API HTTP que
   consumiria cualquier otro cliente, de modo que lo que se prueba desde el
   navegador es exactamente el contrato publicado por los modulos.

   Los atributos data-prueba son los puntos de anclaje de las pruebas
   automatizadas de aceptacion (Playwright). No se eliminan al cambiar el
   estilo de la pantalla.
   =========================================================================== */

const estado = {
  token: null,
  usuario: null,
  disciplinas: [],
  clases: [],
};

const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const porPrueba = (nombre) => document.querySelector(`[data-prueba="${nombre}"]`);

/* --- Acceso a la API ------------------------------------------------------ */

/**
 * Llama a la API y normaliza la respuesta. Nunca lanza por un codigo de error
 * HTTP: devuelve { ok, estado, cuerpo } para que cada pantalla decida como
 * presentar el fallo. Asi la consola muestra el mensaje real del servidor en
 * lugar de un error generico del navegador.
 */
const api = async (ruta, opciones = {}) => {
  const cabeceras = { Accept: 'application/json' };
  if (opciones.cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
  if (estado.token) cabeceras.Authorization = `Bearer ${estado.token}`;

  let respuesta;
  try {
    respuesta = await fetch(ruta, {
      method: opciones.metodo || 'GET',
      headers: cabeceras,
      body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
    });
  } catch (err) {
    return { ok: false, estado: 0, cuerpo: { error: { mensaje: `Sin conexion con el servicio: ${err.message}` } } };
  }

  let cuerpo = null;
  try {
    cuerpo = await respuesta.json();
  } catch {
    cuerpo = {};
  }
  return { ok: respuesta.ok, estado: respuesta.status, cuerpo };
};

const mensajeDeError = (respuesta) =>
  (respuesta.cuerpo && respuesta.cuerpo.error && respuesta.cuerpo.error.mensaje)
  || `La operacion fallo con codigo ${respuesta.estado}`;

/* --- Presentacion --------------------------------------------------------- */

const mostrar = (nombrePrueba, texto, clase = 'exito') => {
  const caja = porPrueba(nombrePrueba);
  if (!caja) return;
  caja.textContent = texto;
  caja.className = `resultado ${clase}`;
  caja.hidden = false;
};

const pintarFilas = (nombreTabla, filas, construir) => {
  const cuerpo = porPrueba(nombreTabla).querySelector('tbody');
  cuerpo.replaceChildren();
  filas.forEach((fila) => {
    const { id, celdas } = construir(fila);
    const tr = document.createElement('tr');
    tr.setAttribute('data-fila', String(id));
    celdas.forEach((valor) => {
      const td = document.createElement('td');
      td.textContent = valor === null || valor === undefined ? '' : String(valor);
      tr.appendChild(td);
    });
    cuerpo.appendChild(tr);
  });
};

const opciones = (select, items, valor, etiqueta) => {
  select.replaceChildren();
  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = String(item[valor]);
    option.textContent = etiqueta(item);
    select.appendChild(option);
  });
};

const datosDelFormulario = (formulario) =>
  Object.fromEntries(new FormData(formulario).entries());

/* --- Navegacion por pestanias --------------------------------------------- */

$$('.pestania').forEach((boton) => {
  boton.addEventListener('click', () => {
    $$('.pestania').forEach((b) => b.classList.toggle('activa', b === boton));
    $$('.panel').forEach((p) => p.classList.toggle('visible', p.id === `panel-${boton.dataset.panel}`));
  });
});

/* --- Sonda de salud ------------------------------------------------------- */

const comprobarSalud = async () => {
  const respuesta = await api('/health');
  const etiqueta = porPrueba('estado-salud');
  if (respuesta.ok) {
    etiqueta.textContent = `Servicio ${respuesta.cuerpo.servicio} en linea`;
    porPrueba('version-plataforma').textContent = `version ${respuesta.cuerpo.version}`;
  } else {
    etiqueta.textContent = `Servicio degradado (${respuesta.estado})`;
  }
};

/* --- Catalogo ------------------------------------------------------------- */

const cargarCatalogo = async () => {
  const disciplinas = await api('/api/catalogo/disciplinas');
  if (!disciplinas.ok) {
    mostrar('origen-catalogo', mensajeDeError(disciplinas), 'fallo');
    return;
  }
  estado.disciplinas = disciplinas.cuerpo.disciplinas;
  porPrueba('origen-catalogo').textContent = `Origen de los datos: ${disciplinas.cuerpo.origen}`;

  pintarFilas('tabla-disciplinas', estado.disciplinas, (d) => ({
    id: d.id_disciplina,
    celdas: [
      d.nombre,
      `${d.edad_minima ?? '-'} a ${d.edad_maxima ?? '-'} anios`,
      `Q ${Number(d.monto_mensualidad).toFixed(2)}`,
      d.descripcion,
    ],
  }));

  const clases = await api('/api/catalogo/clases');
  if (clases.ok) {
    estado.clases = clases.cuerpo.clases;
    pintarFilas('tabla-clases', estado.clases, (c) => ({
      id: c.id_clase,
      celdas: [
        c.id_clase,
        c.disciplina,
        c.nivel,
        c.docente,
        `${c.dia_semana} ${String(c.hora_inicio).slice(0, 5)} - ${String(c.hora_fin).slice(0, 5)}`,
        c.cupo_disponible,
      ],
    }));
    opciones(porPrueba('campo-clase'), estado.clases, 'id_clase',
      (c) => `${c.id_clase} - ${c.disciplina} / ${c.nivel} (${c.dia_semana}, ${c.cupo_disponible} libres)`);
  }

  opciones(porPrueba('campo-disciplina'), estado.disciplinas, 'id_disciplina', (d) => d.nombre);
  await cargarNiveles(estado.disciplinas[0] ? estado.disciplinas[0].id_disciplina : null);
};

const cargarNiveles = async (idDisciplina) => {
  if (!idDisciplina) return;
  const respuesta = await api(`/api/catalogo/disciplinas/${idDisciplina}/niveles`);
  if (respuesta.ok) {
    opciones(porPrueba('campo-nivel'), respuesta.cuerpo.niveles, 'id_nivel',
      (n) => `${n.id_nivel} - ${n.nombre_nivel}`);
  }
};

porPrueba('btn-cargar-catalogo').addEventListener('click', cargarCatalogo);
porPrueba('campo-disciplina').addEventListener('change', (evento) => cargarNiveles(evento.target.value));

/* --- Solicitud de inscripcion --------------------------------------------- */

porPrueba('formulario-solicitud').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const datos = datosDelFormulario(evento.target);
  const respuesta = await api('/api/inscripcion/solicitudes', {
    metodo: 'POST',
    cuerpo: {
      nombreAspirante: datos.nombreAspirante,
      fechaNacimiento: datos.fechaNacimiento,
      idDisciplina: Number(datos.idDisciplina),
      nombreEncargado: datos.nombreEncargado,
      correoContacto: datos.correoContacto,
      telefonoContacto: datos.telefonoContacto,
    },
  });

  if (!respuesta.ok) {
    mostrar('resultado-solicitud', mensajeDeError(respuesta), 'fallo');
    return;
  }

  const solicitud = respuesta.cuerpo.solicitud;
  mostrar(
    'resultado-solicitud',
    `Solicitud ${solicitud.id_solicitud} recibida para ${solicitud.nombre_aspirante} `
    + `en ${respuesta.cuerpo.disciplina}. Estado: ${solicitud.estado}.`
  );
  porPrueba('campo-id-solicitud').value = String(solicitud.id_solicitud);
});

/* --- Sesion --------------------------------------------------------------- */

porPrueba('formulario-sesion').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const datos = datosDelFormulario(evento.target);
  const respuesta = await api('/api/auth/login', {
    metodo: 'POST',
    cuerpo: { correo: datos.correo, contrasena: datos.contrasena },
  });

  if (!respuesta.ok) {
    estado.token = null;
    estado.usuario = null;
    porPrueba('estado-sesion').textContent = 'Sin sesion';
    mostrar('resultado-sesion', mensajeDeError(respuesta), 'fallo');
    return;
  }

  estado.token = respuesta.cuerpo.token;
  estado.usuario = respuesta.cuerpo.usuario;
  porPrueba('estado-sesion').textContent = `${estado.usuario.nombre} (${estado.usuario.rol})`;
  mostrar('resultado-sesion', `Sesion iniciada como ${estado.usuario.rol}.`);
});

porPrueba('btn-cerrar-sesion').addEventListener('click', () => {
  estado.token = null;
  estado.usuario = null;
  porPrueba('estado-sesion').textContent = 'Sin sesion';
  mostrar('resultado-sesion', 'Sesion cerrada.', 'aviso');
});

/* --- Direccion ------------------------------------------------------------ */

porPrueba('btn-cargar-solicitudes').addEventListener('click', async () => {
  const respuesta = await api('/api/inscripcion/solicitudes?estado=Recibida');
  if (!respuesta.ok) {
    mostrar('resultado-resolucion', mensajeDeError(respuesta), 'fallo');
    return;
  }
  pintarFilas('tabla-solicitudes', respuesta.cuerpo.solicitudes, (s) => ({
    id: s.id_solicitud,
    celdas: [s.id_solicitud, s.nombre_aspirante, s.fecha_nacimiento, s.disciplina, s.estado],
  }));
});

porPrueba('formulario-resolucion').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const datos = datosDelFormulario(evento.target);
  const respuesta = await api(`/api/inscripcion/solicitudes/${datos.idSolicitud}/aceptar`, {
    metodo: 'POST',
    cuerpo: { idClase: Number(datos.idClase), idNivel: Number(datos.idNivel) },
  });

  if (!respuesta.ok) {
    mostrar('resultado-resolucion', mensajeDeError(respuesta), 'fallo');
    return;
  }

  const { alumna, asignacion } = respuesta.cuerpo;
  mostrar(
    'resultado-resolucion',
    `Alumna ${alumna.id_alumna} registrada. Clase ${asignacion.idClase}, `
    + `${asignacion.diaSemana} ${String(asignacion.horaInicio).slice(0, 5)}, `
    + `docente ${asignacion.docente}.`
  );
  porPrueba('campo-id-alumna').value = String(alumna.id_alumna);
});

porPrueba('btn-rechazar').addEventListener('click', async () => {
  const datos = datosDelFormulario(porPrueba('formulario-resolucion'));
  const respuesta = await api(`/api/inscripcion/solicitudes/${datos.idSolicitud}/rechazar`, {
    metodo: 'POST',
    cuerpo: { motivo: datos.motivo || 'Sin motivo registrado' },
  });
  if (!respuesta.ok) {
    mostrar('resultado-resolucion', mensajeDeError(respuesta), 'fallo');
    return;
  }
  mostrar('resultado-resolucion', `Solicitud ${respuesta.cuerpo.id_solicitud} rechazada.`, 'aviso');
});

/* --- Pagos ---------------------------------------------------------------- */

porPrueba('formulario-mensualidades').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const datos = datosDelFormulario(evento.target);
  const respuesta = await api(`/api/pagos/mensualidades?alumna=${encodeURIComponent(datos.idAlumna)}`);
  if (!respuesta.ok) {
    mostrar('resultado-pago', mensajeDeError(respuesta), 'fallo');
    return;
  }
  pintarFilas('tabla-mensualidades', respuesta.cuerpo.mensualidades, (m) => ({
    id: m.id_mensualidad,
    celdas: [
      m.id_mensualidad,
      m.disciplina,
      `${String(m.periodo_mes).padStart(2, '0')}/${m.periodo_anio}`,
      `Q ${Number(m.monto).toFixed(2)}`,
      m.fecha_limite_pago,
      m.estado,
    ],
  }));
  const pendiente = respuesta.cuerpo.mensualidades.find((m) => m.estado === 'Pendiente');
  if (pendiente) porPrueba('campo-id-mensualidad').value = String(pendiente.id_mensualidad);
});

porPrueba('formulario-pago').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const datos = datosDelFormulario(evento.target);
  const respuesta = await api(`/api/pagos/mensualidades/${datos.idMensualidad}/pagar`, {
    metodo: 'POST',
    cuerpo: { medioPago: datos.medioPago, tokenTarjeta: datos.tokenTarjeta },
  });

  if (!respuesta.ok && respuesta.estado !== 402) {
    mostrar('resultado-pago', mensajeDeError(respuesta), 'fallo');
    return;
  }
  if (respuesta.estado === 402 || respuesta.cuerpo.aprobado === false) {
    mostrar('resultado-pago', 'La pasarela rechazo el pago. La mensualidad sigue pendiente.', 'fallo');
    return;
  }

  mostrar(
    'resultado-pago',
    `Pago ${respuesta.cuerpo.pago.id_pago} aprobado por Q ${Number(respuesta.cuerpo.pago.monto_total).toFixed(2)}. `
    + `Comprobante ${respuesta.cuerpo.comprobante.numero_correlativo}. `
    + `Mensualidad ${respuesta.cuerpo.mensualidad.id_mensualidad}: ${respuesta.cuerpo.mensualidad.estado}.`
  );
});

/* --- Arranque ------------------------------------------------------------- */

comprobarSalud();
cargarCatalogo();
