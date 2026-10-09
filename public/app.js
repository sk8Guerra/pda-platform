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
  alumnas: [],
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

  // Un 401 teniendo sesion abierta solo puede significar que el token vencio o
  // dejo de ser valido. Se descarta en el acto, para que la pantalla no siga
  // ofreciendo pantallas y acciones que el servidor ya no acepta. Un 403 es
  // otra cosa: la sesion es buena y al rol le falta permiso (RF-002).
  if (respuesta.status === 401 && estado.token) descartarSesion();

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
      // Una celda puede ser texto o un control: la columna de accion del
      // catalogo entrega un boton ya construido.
      if (valor instanceof HTMLElement) {
        td.appendChild(valor);
      } else {
        td.textContent = valor === null || valor === undefined ? '' : String(valor);
      }
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

/**
 * Muestra un panel por su nombre. Se usa tanto desde las pestanias como desde
 * las acciones que llevan a la persona de una pantalla a otra: "Inscribirse"
 * en el catalogo, o el inicio de sesion que desemboca en Direccion.
 */
const irAPanel = (nombre) => {
  $$('.pestania').forEach((b) => b.classList.toggle('activa', b.dataset.panel === nombre));
  $$('.panel').forEach((p) => p.classList.toggle('visible', p.id === `panel-${nombre}`));
  refrescarPanel(nombre);
};

/**
 * Cada pantalla trae sus propios datos al abrirse. Antes habia un boton por
 * tabla; pedir lo que se viene a ver es trabajo de la pantalla, no de quien la
 * usa. Sin sesion no se intenta nada: los dos paneles que consultan la exigen.
 */
const refrescarPanel = (nombre) => {
  if (nombre === 'direccion') cargarSolicitudes();
  if (nombre === 'pagos') {
    cargarAlumnas();
    cargarMensualidades();
  }
};

$$('.pestania').forEach((boton) => {
  boton.addEventListener('click', () => irAPanel(boton.dataset.panel));
});

/**
 * Descubre u oculta lo que depende de la sesion: Direccion y Pagos no se
 * muestran a quien solo viene a consultar la oferta (RF-002). El control real
 * lo hace la API, que exige el token en cada peticion; esto evita ofrecer
 * pantallas que no se podrian usar.
 */
const aplicarSesion = () => {
  const hay = Boolean(estado.token);
  porPrueba('tab-direccion').hidden = !hay;
  porPrueba('tab-pagos').hidden = !hay;
  porPrueba('btn-abrir-sesion').hidden = hay;
  porPrueba('btn-cerrar-sesion').hidden = !hay;
  porPrueba('estado-sesion').textContent = hay
    ? `${estado.usuario.nombre} (${estado.usuario.rol})`
    : 'Sin sesion';
};

porPrueba('btn-abrir-sesion').addEventListener('click', () => irAPanel('sesion'));

/* --- Persistencia de la sesion -------------------------------------------- */

const LLAVE_SESION = 'pda.sesion';

/**
 * La sesion se guarda en sessionStorage y no en localStorage: sobrevive a la
 * recarga, que es lo que hace falta para trabajar, pero desaparece al cerrar la
 * pestania y nunca queda escrita en el disco. El token sigue siendo un portador
 * y lo que impide que un guion ajeno lo lea es la politica de contenido que
 * impone helmet (default-src 'self'), no el lugar donde se guarde.
 */
const guardarSesion = () => {
  try {
    sessionStorage.setItem(LLAVE_SESION, JSON.stringify({
      token: estado.token,
      usuario: estado.usuario,
    }));
  } catch {
    // Navegacion privada o almacenamiento lleno: la sesion sigue viva en
    // memoria y solo se pierde la capacidad de sobrevivir a una recarga.
  }
};

const olvidarSesion = () => {
  try {
    sessionStorage.removeItem(LLAVE_SESION);
  } catch {
    // No habia nada que limpiar.
  }
};

/** Cierra la sesion sin pasar por el boton: la usan el arranque y los 401. */
const descartarSesion = () => {
  estado.token = null;
  estado.usuario = null;
  olvidarSesion();
  aplicarSesion();
};

/**
 * Recupera la sesion guardada al abrir la pantalla y la comprueba contra la API
 * antes de darla por buena: el token dura treinta minutos y el que quedo
 * guardado puede estar vencido. Si ya no sirve, la consola arranca sin sesion.
 */
const restaurarSesion = async () => {
  let guardada = null;
  try {
    guardada = JSON.parse(sessionStorage.getItem(LLAVE_SESION) || 'null');
  } catch {
    guardada = null;
  }
  if (!guardada || !guardada.token) return;

  estado.token = guardada.token;
  estado.usuario = guardada.usuario;
  aplicarSesion();

  const perfil = await api('/api/auth/perfil');
  if (!perfil.ok) {
    // El propio api() ya descarto la sesion al ver el 401.
    return;
  }

  // /perfil devuelve el registro tal como esta en la base; el encabezado espera
  // la forma corta que entrega el login.
  estado.usuario = {
    id: perfil.cuerpo.id_usuario,
    nombre: perfil.cuerpo.nombre_completo,
    correo: perfil.cuerpo.correo_electronico,
    rol: perfil.cuerpo.nombre_rol,
  };
  guardarSesion();
  aplicarSesion();
};

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

/**
 * Lleva a la pantalla de solicitud con la disciplina de la clase elegida ya
 * seleccionada. El cupo no se reserva aqui: la solicitud todavia tiene que
 * aceptarla la direccion, que es quien asigna la clase definitiva (RF-021).
 */
const inscribirseEn = async (clase) => {
  irAPanel('solicitud');

  const seleccionDisciplina = porPrueba('campo-disciplina');
  const disponible = seleccionDisciplina
    .querySelector(`option[value="${clase.id_disciplina}"]`);
  if (disponible) {
    seleccionDisciplina.value = String(clase.id_disciplina);
    await cargarNiveles(seleccionDisciplina.value);
  }

  porPrueba('campo-nombre-aspirante').focus();
};

/**
 * Boton de la columna de accion. Una clase sin cupo no ofrece inscripcion: el
 * motor de base de datos rechazaria la asignacion de todos modos (RN-004), y
 * mas vale decirlo antes de que la aspirante llene el formulario.
 */
const botonInscribirse = (clase) => {
  const boton = document.createElement('button');
  boton.setAttribute('data-prueba', 'btn-inscribirse');
  boton.setAttribute('data-clase', String(clase.id_clase));
  boton.className = 'boton-fila';

  if (Number(clase.cupo_disponible) > 0) {
    boton.textContent = 'Inscribirse';
    boton.classList.add('primario');
    boton.addEventListener('click', () => inscribirseEn(clase));
  } else {
    boton.textContent = 'Sin cupo';
    boton.disabled = true;
    boton.title = 'Esta clase alcanzo su cupo maximo';
  }

  return boton;
};

const cargarCatalogo = async () => {
  const disciplinas = await api('/api/catalogo/disciplinas');
  if (!disciplinas.ok) return;
  estado.disciplinas = disciplinas.cuerpo.disciplinas;

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
        botonInscribirse(c),
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
    descartarSesion();
    mostrar('resultado-sesion', mensajeDeError(respuesta), 'fallo');
    return;
  }

  estado.token = respuesta.cuerpo.token;
  estado.usuario = respuesta.cuerpo.usuario;
  guardarSesion();
  aplicarSesion();
  mostrar('resultado-sesion', `Sesion iniciada como ${estado.usuario.rol}.`);
  // Quien entra viene a resolver solicitudes: se le deja en esa pantalla en
  // lugar de obligarle a buscarla en el navbar.
  irAPanel('direccion');
});

porPrueba('btn-cerrar-sesion').addEventListener('click', () => {
  descartarSesion();
  mostrar('resultado-sesion', 'Sesion cerrada.', 'aviso');
  // Al cerrar la sesion, Direccion y Pagos desaparecen: si se estaba en una de
  // ellas hay que salir, o quedaria un panel visible sin pestania que lo abra.
  irAPanel('catalogo');
});

/* --- Direccion ------------------------------------------------------------ */

/**
 * Bandeja de solicitudes pendientes. Se refresca al entrar a Direccion y
 * despues de cada resolucion: la direccion viene a ver que hay sin resolver, no
 * a pedirlo con un boton.
 */
const cargarSolicitudes = async () => {
  if (!estado.token) return;
  const respuesta = await api('/api/inscripcion/solicitudes?estado=Recibida');
  if (!respuesta.ok) {
    mostrar('resultado-resolucion', mensajeDeError(respuesta), 'fallo');
    return;
  }
  pintarFilas('tabla-solicitudes', respuesta.cuerpo.solicitudes, (s) => ({
    id: s.id_solicitud,
    celdas: [s.id_solicitud, s.nombre_aspirante, s.fecha_nacimiento, s.disciplina, s.estado],
  }));
};

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
  cargarSolicitudes();
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
  cargarSolicitudes();
});

/* --- Pagos ---------------------------------------------------------------- */

/**
 * Alumnas registradas. La lista la publica el modulo de inscripcion, que es
 * quien las crea; esta pantalla la consume por HTTP igual que cualquier otro
 * cliente, sin invocar nada de ese modulo por dentro (RNF-023).
 */
const cargarAlumnas = async () => {
  if (!estado.token) return;
  const respuesta = await api('/api/inscripcion/alumnas');
  if (!respuesta.ok) {
    mostrar('resultado-pago', mensajeDeError(respuesta), 'fallo');
    return;
  }

  estado.alumnas = respuesta.cuerpo.alumnas;
  pintarFilas('tabla-alumnas', estado.alumnas, (a) => ({
    id: a.id_alumna,
    celdas: [
      a.id_alumna,
      a.nombre_completo,
      a.disciplina ?? '-',
      a.nivel ?? '-',
      a.dia_semana
        ? `${a.dia_semana} ${String(a.hora_inicio).slice(0, 5)} - ${String(a.hora_fin).slice(0, 5)}`
        : '-',
      a.estado,
      botonVerMensualidades(a),
    ],
  }));
};

/** Lleva el identificador de la alumna al campo, lo que dispara la consulta. */
const botonVerMensualidades = (alumna) => {
  const boton = document.createElement('button');
  boton.setAttribute('data-prueba', 'btn-ver-mensualidades');
  boton.setAttribute('data-alumna', String(alumna.id_alumna));
  boton.className = 'boton-fila primario';
  boton.textContent = 'Ver mensualidades';
  boton.addEventListener('click', () => {
    porPrueba('campo-id-alumna').value = String(alumna.id_alumna);
    cargarMensualidades();
  });
  return boton;
};

/**
 * Mensualidades de la alumna indicada en el campo. Sale sola al elegir una
 * alumna, al escribir un identificador y al entrar a la pantalla si ya habia
 * uno puesto, por ejemplo despues de registrarla desde Direccion.
 */
const cargarMensualidades = async () => {
  const idAlumna = porPrueba('campo-id-alumna').value.trim();
  if (!idAlumna || !estado.token) return;

  const respuesta = await api(`/api/pagos/mensualidades?alumna=${encodeURIComponent(idAlumna)}`);
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
};

// Escribir un identificador a mano tambien consulta, sin boton de por medio. Se
// espera un cuarto de segundo desde la ultima tecla para no lanzar una peticion
// por cada digito mientras se escribe.
let esperaMensualidades = null;
porPrueba('campo-id-alumna').addEventListener('input', () => {
  clearTimeout(esperaMensualidades);
  esperaMensualidades = setTimeout(cargarMensualidades, 250);
});

porPrueba('formulario-mensualidades').addEventListener('submit', (evento) => {
  evento.preventDefault();
  cargarMensualidades();
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
  cargarMensualidades();
});

/* --- Arranque ------------------------------------------------------------- */

aplicarSesion();
restaurarSesion();
comprobarSalud();
cargarCatalogo();
