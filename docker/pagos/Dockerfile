# =============================================================================
# Servicio PAGOS - Perfect Dance Academy
#
# PAGOS - Mensualidades, transacciones y comprobantes
# Modulo 4 del modelo de datos: pago, comprobante_pago, mensualidad.
#
# La imagen se construye a partir del mismo codigo fuente que el monolito y se
# diferencia unicamente en la variable SERVICE, que determina que modulo se monta
# en el arranque. De esta forma un modulo puede desplegarse, escalarse y
# monitorearse por separado sin bifurcar ni duplicar el codigo (RNF-023).
#
# Construccion desde la raiz del repositorio:
#   docker build -f docker/pagos/Dockerfile -t pda-pagos:latest .
# =============================================================================

# --- Etapa 1: dependencias --------------------------------------------------
FROM node:20-alpine AS dependencias

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# --- Etapa 2: ejecucion -----------------------------------------------------
FROM node:20-alpine AS ejecucion

RUN apk add --no-cache dumb-init

ENV NODE_ENV=production \
    SERVICE=pagos \
    PORT=3004

WORKDIR /app

COPY --from=dependencias /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY public ./public

RUN chown -R node:node /app
USER node

EXPOSE 3004

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3004)+'/health/vivo').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
