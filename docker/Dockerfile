# =============================================================================
# Imagen del monolito modular - Perfect Dance Academy
#
# Construye la aplicacion completa (los cuatro modulos en un solo proceso). Es la
# topologia de despliegue por defecto, la que corresponde a la arquitectura
# documentada en la septima entrega.
#
# Construccion desde la raiz del repositorio:
#   docker build -f docker/Dockerfile -t pda-platform:latest .
# =============================================================================

# --- Etapa 1: dependencias --------------------------------------------------
FROM node:20-alpine AS dependencias

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# --- Etapa 2: ejecucion -----------------------------------------------------
FROM node:20-alpine AS ejecucion

# dumb-init entrega las senales del sistema al proceso de Node, de modo que el
# contenedor se apague de forma ordenada y cierre sus conexiones (SIGTERM).
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production \
    SERVICE=monolito \
    PORT=3000

WORKDIR /app

COPY --from=dependencias /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY public ./public
# El esquema y el guion de migracion viajan en la imagen para que el entorno de
# staging pueda aplicarlos como una tarea previa al despliegue: alli no existe el
# mecanismo de arranque de PostgreSQL que Docker Compose usa en local.
COPY db ./db
COPY scripts ./scripts

# El proceso no corre como root: la imagen base ya provee el usuario "node".
RUN chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/vivo').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
