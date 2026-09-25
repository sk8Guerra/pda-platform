#!/usr/bin/env bash
# =============================================================================
# Devuelve la direccion publica del entorno de staging.
#
# El servicio de staging corre como una tarea de Fargate con direccion publica y
# sin balanceador, de modo que la direccion cambia cada vez que la tarea se
# reemplaza. Este guion la resuelve en el momento, tanto para abrirla en el
# navegador como para que la canalizacion ejecute la prueba de humo.
#
# Uso:
#   ./scripts/url-staging.sh [nombre-de-la-pila] [region]
# =============================================================================
set -euo pipefail

PILA="${1:-${PILA_STAGING:-pda-staging}}"
REGION="${2:-${AWS_REGION:-us-east-1}}"

CLUSTER="$(aws cloudformation describe-stacks \
  --stack-name "$PILA" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='NombreCluster'].OutputValue" --output text)"

SERVICIO="$(aws cloudformation describe-stacks \
  --stack-name "$PILA" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='NombreServicio'].OutputValue" --output text)"

TAREA="$(aws ecs list-tasks \
  --cluster "$CLUSTER" --service-name "$SERVICIO" --desired-status RUNNING \
  --region "$REGION" --query 'taskArns[0]' --output text)"

if [[ "$TAREA" == "None" || -z "$TAREA" ]]; then
  echo "No hay ninguna tarea en ejecucion en el servicio $SERVICIO." >&2
  exit 1
fi

ENI="$(aws ecs describe-tasks \
  --cluster "$CLUSTER" --tasks "$TAREA" --region "$REGION" \
  --query "tasks[0].attachments[0].details[?name=='networkInterfaceId'].value" --output text)"

IP="$(aws ec2 describe-network-interfaces \
  --network-interface-ids "$ENI" --region "$REGION" \
  --query 'NetworkInterfaces[0].Association.PublicIp' --output text)"

echo "http://${IP}:3000"
