#!/usr/bin/env bash
# =============================================================================
# Levanta o destruye el entorno de staging completo con un solo comando.
#
# Junta en un guion los pasos que ya se probaron a mano contra la cuenta de
# AWS: red, base de datos, secretos y registro de imagenes (infra/staging.yml),
# la imagen del monolito construida para x86-64 y publicada en ECR, la
# migracion del esquema y la semilla, y por ultimo el desmontaje completo.
#
# Pensado para un entorno que se enciende para una demostracion y se apaga el
# mismo dia: "arriba" deja la consola funcionando y responde con su URL;
# "abajo" no deja nada facturando.
#
# Uso:
#   ./scripts/gestionar-staging.sh arriba  [nombre-de-la-pila] [region]
#   ./scripts/gestionar-staging.sh abajo   [nombre-de-la-pila] [region]
#   ./scripts/gestionar-staging.sh estado  [nombre-de-la-pila] [region]
#
# Variables de entorno opcionales:
#   CIDR_DE_ACCESO   Restringe el entorno a una direccion IP concreta
#                    (por ejemplo "$(curl -s ifconfig.me)/32"). Sin definir,
#                    la plantilla usa su valor por defecto (0.0.0.0/0).
#
# Requiere: aws-cli autenticado, docker con soporte buildx para linux/amd64,
# y correr desde la raiz del repositorio (usa infra/staging.yml y
# docker/Dockerfile con rutas relativas).
# =============================================================================
set -euo pipefail

ACCION="${1:-}"
PILA="${2:-${PILA_STAGING:-pda-staging}}"
REGION="${3:-${AWS_REGION:-us-east-1}}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

registrar() { echo "[gestionar-staging] $*"; }

uso() {
  echo "Uso: $0 arriba|abajo|estado [nombre-de-la-pila] [region]" >&2
  exit 1
}

comprobar_identidad() {
  registrar "verificando sesion de AWS..."
  aws sts get-caller-identity --region "$REGION" > /dev/null \
    || { echo "La sesion de AWS no es valida. Correr 'aws login' o 'aws configure' y reintentar." >&2; exit 1; }
}

desplegar_pila() {
  local cantidad_deseada="$1"
  local parametros=(
    NombreProyecto=pda-platform
    CantidadDeseada="$cantidad_deseada"
    CrearRepositoriosECR=si
  )
  if [[ -n "${CIDR_DE_ACCESO:-}" ]]; then
    parametros+=("CidrDeAcceso=$CIDR_DE_ACCESO")
  fi

  aws cloudformation deploy \
    --template-file "$RAIZ/infra/staging.yml" \
    --stack-name "$PILA" \
    --capabilities CAPABILITY_NAMED_IAM \
    --region "$REGION" \
    --parameter-overrides "${parametros[@]}"
}

salida_de_pila() {
  aws cloudformation describe-stacks --stack-name "$PILA" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

# --- arriba ------------------------------------------------------------------

arriba() {
  comprobar_identidad

  registrar "paso 1/5 - red, base de datos, secretos y registro (servicio apagado)..."
  registrar "  esto tarda entre 10 y 15 minutos, casi todo esperando a RDS."
  desplegar_pila 0

  registrar "paso 2/5 - construyendo y publicando la imagen (linux/amd64)..."
  local cuenta registro
  cuenta="$(aws sts get-caller-identity --query Account --output text --region "$REGION")"
  registro="$cuenta.dkr.ecr.$REGION.amazonaws.com"

  aws ecr get-login-password --region "$REGION" \
    | docker login --username AWS --password-stdin "$registro" > /dev/null

  # Fargate corre sobre x86-64. Sin --platform la imagen no arranca alli si se
  # construye desde una Mac con Apple Silicon (exec format error).
  docker buildx build --platform linux/amd64 \
    -f "$RAIZ/docker/Dockerfile" \
    -t "$registro/pda-platform:latest" \
    --push "$RAIZ"

  registrar "paso 3/5 - encendiendo el servicio..."
  desplegar_pila 1

  registrar "paso 4/5 - aplicando esquema y semilla sobre la base de datos..."
  local cluster familia subredes grupo tarea codigo
  cluster="$(salida_de_pila NombreCluster)"
  familia="$(salida_de_pila FamiliaTarea)"
  subredes="$(salida_de_pila SubredesPublicas)"
  grupo="$(salida_de_pila GrupoSeguridadServicio)"

  tarea="$(aws ecs run-task \
    --cluster "$cluster" --task-definition "$familia" --launch-type FARGATE \
    --region "$REGION" \
    --network-configuration "awsvpcConfiguration={subnets=[$subredes],securityGroups=[$grupo],assignPublicIp=ENABLED}" \
    --overrides '{"containerOverrides":[{"name":"api","command":["node","scripts/migrar.js"]}]}' \
    --query 'tasks[0].taskArn' --output text)"

  aws ecs wait tasks-stopped --cluster "$cluster" --tasks "$tarea" --region "$REGION"

  codigo="$(aws ecs describe-tasks --cluster "$cluster" --tasks "$tarea" --region "$REGION" \
    --query 'tasks[0].containers[?name==`api`].exitCode' --output text)"

  if [[ "$codigo" != "0" ]]; then
    echo "La migracion termino con codigo $codigo. Revisar /ecs/${PILA}... en CloudWatch." >&2
    exit 1
  fi
  registrar "  migracion aplicada (codigo de salida 0)."

  registrar "paso 5/5 - comprobando el entorno..."
  local url
  url="$("$RAIZ/scripts/url-staging.sh" "$PILA" "$REGION")"

  echo
  registrar "listo. Consola disponible en: $url"
  curl -s "$url/health" || true
  echo
}

# --- abajo ---------------------------------------------------------------

abajo() {
  comprobar_identidad

  if ! aws cloudformation describe-stacks --stack-name "$PILA" --region "$REGION" > /dev/null 2>&1; then
    registrar "la pila '$PILA' no existe en $REGION. No hay nada que destruir."
    return 0
  fi

  registrar "eliminando la pila '$PILA' (red, RDS, ECS, ECR, secretos, panel)..."
  registrar "  esto tarda entre 5 y 8 minutos, casi todo esperando a RDS."
  aws cloudformation delete-stack --stack-name "$PILA" --region "$REGION"
  aws cloudformation wait stack-delete-complete --stack-name "$PILA" --region "$REGION"
  registrar "  pila eliminada."

  # Los secretos quedan programados a 7 dias por defecto; se fuerza el borrado
  # inmediato para que no quede nada pendiente de facturar.
  for secreto in pda-platform/staging/postgres pda-platform/staging/jwt; do
    if aws secretsmanager describe-secret --secret-id "$secreto" --region "$REGION" > /dev/null 2>&1; then
      aws secretsmanager delete-secret --secret-id "$secreto" --region "$REGION" \
        --force-delete-without-recovery > /dev/null
      registrar "  secreto $secreto eliminado sin espera de recuperacion."
    fi
  done

  estado
}

# --- estado ------------------------------------------------------------------

estado() {
  comprobar_identidad
  registrar "verificando que no quede nada facturando en $REGION..."
  echo "Pilas:"
  aws cloudformation list-stacks --region "$REGION" \
    --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE CREATE_IN_PROGRESS DELETE_FAILED \
    --query 'StackSummaries[].StackName' --output table
  echo "Instancias RDS:"
  aws rds describe-db-instances --region "$REGION" \
    --query 'DBInstances[].DBInstanceIdentifier' --output table
  echo "Repositorios ECR:"
  aws ecr describe-repositories --region "$REGION" \
    --query 'repositories[].repositoryName' --output table
}

# --- despacho ------------------------------------------------------------------

case "$ACCION" in
  arriba) arriba ;;
  abajo)  abajo ;;
  estado) estado ;;
  *) uso ;;
esac
