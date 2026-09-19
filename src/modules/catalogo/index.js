'use strict';

const { Router } = require('express');
const servicio = require('./servicio');
const { asincrono } = require('../../core/errores');
const { requiereSesion, requiereRol } = require('../../core/seguridad');

/**
 * Modulo CATALOGO - Oferta academica publicable.
 * Disciplinas, niveles y clases con su horario, docente y cupo disponible.
 * Es el unico modulo con lectura publica: una aspirante consulta la oferta antes
 * de existir como usuaria de la plataforma.
 */

const router = Router();

router.get('/disciplinas', asincrono(async (_req, res) => {
  res.json(await servicio.listarDisciplinas());
}));

router.get('/disciplinas/:id/niveles', asincrono(async (req, res) => {
  res.json(await servicio.listarNiveles(Number(req.params.id)));
}));

router.get('/clases', asincrono(async (req, res) => {
  res.json(await servicio.listarClases({
    idDisciplina: req.query.disciplina ? Number(req.query.disciplina) : null,
    idNivel: req.query.nivel ? Number(req.query.nivel) : null,
  }));
}));

router.post(
  '/cache/invalidar',
  requiereSesion,
  requiereRol('Administrador'),
  asincrono(async (_req, res) => {
    res.json({ llavesEliminadas: await servicio.invalidarCache() });
  })
);

module.exports = {
  nombre: 'catalogo',
  descripcion: 'Disciplinas, niveles, clases y disponibilidad de cupo',
  basePath: '/api/catalogo',
  router,
};
