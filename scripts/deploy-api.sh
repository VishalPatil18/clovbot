#!/usr/bin/env bash
#
# One command to deploy the API to Cloud Run.
#
#   npm run deploy:api
#
# Reads configuration from .env so there is one source of truth for it, and
# passes secrets to Cloud Run as environment variables rather than baking them
# into the image. NFR-SEC-03.
set -euo pipefail

SERVICE="${CLOUD_RUN_SERVICE:-clovbot-api}"
REGION="${CLOUD_RUN_REGION:-us-east1}"

if [[ ! -f .env ]]; then
  echo "No .env found. Copy .env.example to .env and fill it in." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a; source .env; set +a

PROJECT="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
if [[ -z "${PROJECT}" || "${PROJECT}" == "(unset)" ]]; then
  echo "No Google Cloud project. Set GCP_PROJECT_ID in .env, or run:" >&2
  echo "  gcloud config set project YOUR_PROJECT_ID" >&2
  exit 1
fi

# The snapshot id is baked in at deploy time because the container has no
# data/ directory; chunks are read from Postgres by that id.
SNAPSHOT="${CORPUS_SNAPSHOT_ID:-}"
if [[ -z "${SNAPSHOT}" && -d data/snapshots ]]; then
  SNAPSHOT="$(ls data/snapshots | sort | tail -1)"
fi
if [[ -z "${SNAPSHOT}" ]]; then
  echo "No corpus snapshot. Run 'npm run corpus:discover' or set CORPUS_SNAPSHOT_ID." >&2
  exit 1
fi

required=(DATABASE_URL AZURE_OPENAI_ENDPOINT AZURE_OPENAI_API_KEY AZURE_OPENAI_API_VERSION
          AZURE_OPENAI_DEPLOYMENT AZURE_OPENAI_EMBEDDING_DEPLOYMENT)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing ${name} in .env" >&2
    exit 1
  fi
done

echo "Deploying ${SERVICE} to ${PROJECT} (${REGION}), corpus snapshot ${SNAPSHOT}"

# Optional keys are passed only when present, so a missing voice key degrades
# to the browser synthesiser rather than failing the deploy. FR-20.
env_vars="CORPUS_SNAPSHOT_ID=${SNAPSHOT}"
for name in DATABASE_URL AZURE_OPENAI_ENDPOINT AZURE_OPENAI_API_KEY AZURE_OPENAI_API_VERSION \
            AZURE_OPENAI_DEPLOYMENT AZURE_OPENAI_EMBEDDING_DEPLOYMENT GEMINI_API_KEY GEMINI_MODEL \
            ELEVENLABS_API_KEY ELEVENLABS_VOICE_ID ELEVENLABS_TTS_MODEL ELEVENLABS_STT_MODEL \
            FISH_AUDIO_API_KEY FISH_AUDIO_VOICE_ID; do
  value="${!name:-}"
  # Only the first element declares the separator; repeating ^@@^ would fold it
  # into the next variable name and silently drop the variable.
  [[ -n "${value}" ]] && env_vars+="@@${name}=${value}"
done

gcloud run deploy "${SERVICE}" \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --source . \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 120 \
  --concurrency 20 \
  --min-instances 1 \
  --max-instances 3 \
  --set-env-vars "^@@^${env_vars}"

url="$(gcloud run services describe "${SERVICE}" --project "${PROJECT}" --region "${REGION}" \
        --format 'value(status.url)')"

echo ""
echo "Deployed: ${url}"
echo ""
echo "Verify:"
echo "  curl -sS ${url}/api/plans"
echo ""
echo "Put this in Vercel as CLOVBOT_API_ORIGIN so the frontend proxies to it."
