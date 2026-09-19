'use strict';

const { Router } = require('express');
const servicio = require('./servicio');
const { asincrono } = require('../../core/errores');
const { requiereSesion, requiereRol } = require('../../core/seguridad');

/**
 * Modulo INSCRIPCION - Recorrido de la aspirante.
 *
 * Envio de la solicitud (publico), resolucion por parte de la direccion y
 * registro de la alumna aceptada con su asignacion de clase, horario y docente.
 */

const router = Router();

// Tramo 1: la aspirante o su encargado envian la solicitud. No requiere sesion:
// quien solicita todavia no es usuaria de la plataforma.
router.post('/solicitudes', asincrono(async (req, res) => {
  const resultado = await servicio.crearSolicitud(req.body || {});
  res.status(201).json(resultado);
}));

router.get('/solicitudes', requiereSesion, asincrono(async (req, res) => {
  res.json({ solicitudes: await servicio.listarSolicitudes(req.query.estado || null) });
}));

router.get('/solicitudes/:id', requiereSesion, asincrono(async (req, res) => {
  res.json(await servicio.obtenerSolicitud(Number(req.params.id)));
}));

// Tramo 2: la direccion acepta y con ello se ejecuta el registro completo.
router.post(
  '/solicitudes/:id/aceptar',
  requiereSesion,
  requiereRol('Administrador'),
  asincrono(async (req, res) => {
    const resultado = await servicio.aceptarSolicitud(Number(req.params.id), {
      idClase: Number(req.body?.idClase),
      idNivel: Number(req.body?.idNivel),
      idUsuarioAutoriza: req.usuario.sub,
    });
    res.status(201).json(resultado);
  })
);

router.post(
  '/solicitudes/:id/rechazar',
  requiereSesion,
  requiereRol('Administrador'),
  asincrono(async (req, res) => {
    res.json(await servicio.rechazarSolicitud(Number(req.params.id), {
      motivo: req.body?.motivo,
      idUsuarioAutoriza: req.usuario.sub,
    }));
  })
);

module.exports = {
  nombre: 'inscripcion',
  descripcion: 'Solicitud de inscripcion, resolucion y registro de la alumna',
  basePath: '/api/inscripcion',
  router,
};
