'use strict';

const { Router } = require('express');
const servicio = require('./servicio');
const { asincrono } = require('../../core/errores');
const { requiereSesion } = require('../../core/seguridad');

/**
 * Modulo PAGOS - Mensualidades, pagos y comprobantes.
 * Toda la interaccion con datos de tarjeta esta delegada a la pasarela externa.
 */

const router = Router();

router.get('/mensualidades', requiereSesion, asincrono(async (req, res) => {
  const mensualidades = await servicio.listarMensualidades(
    Number(req.query.alumna),
    req.query.estado || null
  );
  res.json({ mensualidades });
}));

router.post('/mensualidades/:id/pagar', requiereSesion, asincrono(async (req, res) => {
  const resultado = await servicio.pagarMensualidad({
    idMensualidad: Number(req.params.id),
    idUsuario: req.usuario.sub,
    medioPago: req.body?.medioPago,
    tokenTarjeta: req.body?.tokenTarjeta,
    idUsuarioRegistro: req.body?.idUsuarioRegistro,
  });
  res.status(resultado.aprobado ? 201 : 402).json(resultado);
}));

router.get('/:id', requiereSesion, asincrono(async (req, res) => {
  res.json(await servicio.obtenerPago(Number(req.params.id)));
}));

module.exports = {
  nombre: 'pagos',
  descripcion: 'Mensualidades, transacciones de pago y comprobantes',
  basePath: '/api/pagos',
  router,
};
