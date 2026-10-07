#!/usr/bin/env bash
set -euo pipefail
: "${MONGODB_URI:?Defini MONGODB_URI}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-gastos-fullstack}"
PROJECT_NUMBER="${PROJECT_NUMBER:-6451687015}"
SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
if [ -z "${PROJECT_ID:-}" ]; then
  PROJECT_ID="$(gcloud projects list --filter="projectNumber=${PROJECT_NUMBER}" --format='value(projectId)' | head -1)"
fi
: "${PROJECT_ID:?No encontre el proyecto}"
gcloud config set project "$PROJECT_ID"
cat > /tmp/gastos-env.yaml << EOF
MONGODB_URI: "${MONGODB_URI}"
MONGODB_DB: "gastos"
JWT_SECRET: "${SECRET}"
EOF
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu-boost \
  --timeout 300 \
  --env-vars-file /tmp/gastos-env.yaml
rm -f /tmp/gastos-env.yaml
gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)'
