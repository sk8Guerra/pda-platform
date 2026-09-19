'use strict';

const config = require('../../core/config');
const logger = require('../../core/logger');

/**
 * Adaptador de la pasarela de pagos.
 *
 * La plataforma nunca recibe ni almacena datos de tarjeta: el cliente obtiene un
 * token directamente de la pasarela certificada bajo PCI DSS y la plataforma solo
 * maneja ese token (RF-030, RNF-017). Este adaptador aisla al resto del sistema
 * del proveedor concreto, que puede cambiarse sin tocar la logica de negocio.
 *
 * En entornos de desarrollo y de integracion continua no hay proveedor
 * configurado, por lo que el adaptador responde en modo simulado.
 */

const autorizar = async ({ tokenTarjeta, monto, referencia }) => {
  if (!config.pasarela.url || !config.pasarela.apiKey) {
    logger.warn('Pasarela no configurada: se autoriza en modo simulado', { referencia });
    return {
      aprobado: true,
      referenciaPasarela: `SIM-${Date.now()}`,
      simulado: true,
    };
  }

  const respuesta = await fetch(`${config.pasarela.url}/autorizaciones`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.pasarela.apiKey}`,
      'X-Comercio': config.pasarela.comercioId,
    },
    body: JSON.stringify({ token: tokenTarjeta, monto, referencia }),
  });

  if (!respuesta.ok) {
    logger.error('La pasarela rechazo la autorizacion', { estado: respuesta.status, referencia });
    return { aprobado: false, referenciaPasarela: null, simulado: false };
  }

  const cuerpo = await respuesta.json();
  return {
    aprobado: cuerpo.estado === 'aprobado',
    referenciaPasarela: cuerpo.id_transaccion || null,
    simulado: false,
  };
};

module.exports = { autorizar };
