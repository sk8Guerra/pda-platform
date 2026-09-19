'use strict';

const { Router } = require('express');
const servicio = require('./servicio');
const { asincrono } = require('../../core/errores');
const { requiereSesion, requiereRol } = require('../../core/seguridad');

/**
 * Modulo AUTH - Gestion de usuarios, roles y permisos.
 * Corresponde al Modulo 1 del modelo de datos (rol, usuario, bitacora_auditoria).
 */

const router = Router();

router.post('/login', asincrono(async (req, res) => {
  const { correo, contrasena } = req.body || {};
  res.json(await servicio.iniciarSesion(correo, contrasena));
}));

router.get('/perfil', requiereSesion, asincrono(async (req, res) => {
  res.json(await servicio.obtenerPerfil(req.usuario.sub));
}));

router.get(
  '/usuarios',
  requiereSesion,
  requiereRol('Administrador'),
  asincrono(async (req, res) => {
    const limite = Number.parseInt(req.query.limite, 10) || 50;
    res.json({ usuarios: await servicio.listarUsuarios(limite) });
  })
);

module.exports = {
  nombre: 'auth',
  descripcion: 'Identidad, autenticacion y control de acceso por rol',
  basePath: '/api/auth',
  router,
};
