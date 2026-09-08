# Clovbot

> A chatbot that Clover Health members can talk to.

Built with [_throughspec_](https://throughspec.v-ai.org/) - a Spec-Driven Development Kit built by Vishal.

---

## Quick Start

```bash
# 1. install dependencies
<command>

# 2. configure env
cp .env.example .env

# 3. run locally
<command>

# 4. run tests
<command>
```

---

## Project Structure

This project follows the **Spec-Driven Development** layout:

```text
.
├── CLAUDE.md              # behavior contract for Claude Code - read first
├── claude/                # durable memory layer
│   ├── srs.md             # frozen requirements
│   ├── plan.md            # staged build plan
│   ├── context.md         # current-state snapshot
│   ├── features.md        # append-only feature log
│   ├── design-decisions.md
│   └── learnings.md       # student-facing learning trail
├── design/                # design system + UI preview assets
└── .github/               # PR + issue templates
```

For the full workflow guide see [the Kit's documentation](https://example.com/spec-init/docs).

---

## Workflow

This project uses a strict Spec-Driven SDLC. Every feature flows through six phases:

1. Requirements → 2. Architecting → 3. Product Specs → 4. Tech Specs → 5. Planning → 6. Writing Code

Invoke any phase via Claude Code:

| Skill                | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `/spec-requirements` | Build or amend `claude/srs.md`            |
| `/spec-design`       | Build or amend `design/design.md`         |
| `/spec-plan`         | Build or amend `claude/plan.md`           |
| `/spec-feature`      | Run the 6-phase feature cycle             |
| `/spec-bug`          | Isolated bug resolution                   |
| `/spec-docs`         | Isolated documentation rewrite            |
| `/spec-sync`         | Reconcile memory files against repo state |

Supporting skills, invoked as needed:

| Skill                | Purpose                                               |
| -------------------- | ----------------------------------------------------- |
| `/spec-architect`    | Design module/service/layer boundaries + ADRs         |
| `/spec-db-design`    | Design and review the database schema                 |
| `/spec-review`       | Multi-axis review (code/pr/frontend/backend/comments) |
| `/spec-code-quality` | Improve code quality and simplify                     |
| `/spec-security`     | Threat-model and harden                               |
| `/spec-performance`  | Measurement-first performance work                    |
| `/spec-test`         | Review test coverage and quality                      |
| `/spec-ux`           | Review usability and accessibility                    |
| `/spec-cicd`         | Review or set up CI/CD quality gates                  |
| `/spec-launch`       | Staged rollout across environments with rollback      |
| `/spec-git`          | Git operations and semantic-version releases          |
| `/spec-brainstorm`   | Generate options with explicit tradeoffs              |
| `/spec-suggest`      | Leverage-ranked improvement suggestions               |
| `/spec-research`     | External knowledge or market research                 |
| `/spec-resume`       | Resume interrupted work from a resumption brief       |

---

## Integrations

<!-- Integration blocks below are inserted or removed by `spec-init init --integrations …` and `spec-init customize --add/--remove <name>`. If no block appears in this section, no integrations are active. -->

### Caveman

This project is wired for [Caveman](https://github.com/JuliusBrussee/caveman) - a token-compression skill that makes the agent reply in terse "caveman" prose, cutting output tokens ~65% while keeping code, commands, and errors byte-exact. It also manages the compression mode across a session (`/caveman-stats` reports savings). Install it once (free, local, no account):

```sh
npx skills add JuliusBrussee/caveman
```

See `claude/caveman.md` for modes and usage.

### agentmemory

This project is wired for [agentmemory](https://github.com/rohitg00/agentmemory) - persistent memory for AI coding agents that captures decisions and context across sessions and injects them back at session start (local SQLite, no external database). Set it up once:

```sh
npx @agentmemory/agentmemory        # starts the memory server on port 3111
agentmemory connect claude-code     # wires the MCP server into Claude Code
npx skills add rohitg00/agentmemory -y
```

For a zero-cost setup, use local embeddings (`EMBEDDING_PROVIDER=local` in `~/.agentmemory/.env`). See `claude/agentmemory.md`.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Security

See [SECURITY.md](./SECURITY.md).

## License

_<choose a license>_

## Deployment

The frontend is a static build on Vercel at `clovbot.v-ai.org`. The API is a
container on Google Cloud Run. Vercel proxies `/api/*` to Cloud Run, which keeps
the session cookie first-party: it is `HttpOnly; SameSite=Lax`, so a cross-origin
call would drop it and take rate limiting and the loop breaker with it.

### Deploy the API

```bash
npm run deploy:api
```

One command. It reads `.env`, resolves the current corpus snapshot id, and
deploys to Cloud Run, passing every credential as an environment variable. No
secret is baked into the image.

Override the defaults with `CLOUD_RUN_SERVICE`, `CLOUD_RUN_REGION` and
`GCP_PROJECT_ID` in `.env`.

### First-time Google Cloud setup

Once per project.

1. **Create or pick a project and set it as the default.**

   ```bash
   gcloud auth login
   gcloud projects create clovbot-prod --name="Clover Assistant"   # or reuse one
   gcloud config set project clovbot-prod
   ```

2. **Attach billing.** Cloud Run needs a billing account **linked to the
   project**, even when credits pay the bill.

   ```bash
   gcloud billing accounts list
   ```

   Check the `OPEN` column. An account showing `False` is closed, and credits on
   a closed account cannot be spent or linked. Expired trial accounts show this
   way. Reactivate or upgrade one at
   [console.cloud.google.com/billing](https://console.cloud.google.com/billing),
   or add a new one. If the credits came from a programme, they may sit on a
   different Google identity - check with `gcloud auth list`.

   With an open account:

   ```bash
   gcloud billing projects link YOUR_PROJECT_ID --billing-account=ACCOUNT_ID
   ```

   Skipping this produces a misleading error on the next step:

   ```
   FAILED_PRECONDITION: Billing account for project '...' is not found.
   ```

   It names the project, but the cause is the billing account: either none is
   linked, or the one you linked is closed.

3. **Enable the services the deploy uses.**

   ```bash
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
     artifactregistry.googleapis.com
   ```

4. **Grant Cloud Build its permissions.** On a project created after early
   2024 the default Compute Engine service account starts with no roles, so
   Cloud Build cannot read the source it just uploaded.

   ```bash
   PROJECT_ID="$(gcloud config get-value project)"
   PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"

   gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
     --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
     --role=roles/cloudbuild.builds.builder
   ```

   Skipping this fails the deploy with a message that names a storage object
   rather than the missing role:

   ```
   Error 403: ...-compute@developer.gserviceaccount.com does not have
   storage.objects.get access to the Google Cloud Storage object
   ```

   IAM takes up to a minute to propagate. The same error on an immediate retry
   usually means the binding has not landed yet.

5. **Deploy.**

   ```bash
   npm run deploy:api
   ```

   The first run takes several minutes: Cloud Build builds the image and pushes
   it to Artifact Registry. Later runs are faster.

6. **Check it answers.**

   ```bash
   curl -sS https://YOUR-SERVICE-URL/api/plans
   ```

**On cost.** The service runs with `--min-instances 1` so the reranker model
stays loaded. Measured cold, the model costs 2453ms on first use and 4ms warm,
so a scale-to-zero service would pay that on every idle period. One always-on
instance is not free; it is paid from the Google Cloud credits this project
uses. Set `--min-instances 0` in `scripts/deploy-api.sh` to trade latency for
cost.

### Deploy the frontend

1. **Point Vercel at the repository.** Import the project; the build settings
   come from `vercel.json`.

2. **Set the API origin.** Open `vercel.json` and replace
   `REPLACE_WITH_CLOUD_RUN_URL` with the Cloud Run URL printed by
   `npm run deploy:api`, then commit. It is not a secret; it is a public origin.

3. **Add the domain.** Vercel: Project, Settings, Domains, add
   `clovbot.v-ai.org`. Vercel shows a CNAME target.

4. **Add the DNS record at name.com.** Domains, `v-ai.org`, DNS Records:

   | Type | Host | Answer | TTL |
   | --- | --- | --- | --- |
   | CNAME | `clovbot` | the target Vercel shows, usually `cname.vercel-dns.com` | 300 |

   Propagation is usually minutes. Vercel issues the certificate automatically
   once the record resolves.

5. **Verify end to end.**

   ```bash
   curl -sS https://clovbot.v-ai.org/api/plans
   ```

   That request goes to Vercel and is proxied to Cloud Run. If it returns plans,
   the whole path works.

### Continuous deployment

`.github/workflows/deploy-api.yml` runs the same deploy on a push to `main` that
touches `src/`, the `Dockerfile` or dependencies, and only after typecheck and
tests pass.

Configure once in the repository settings.

**Secrets** (Settings, Secrets and variables, Actions, Secrets):

| Name | Value |
| --- | --- |
| `GCP_SA_KEY` | JSON key for a service account with Cloud Run Admin, Cloud Build Editor, Artifact Registry Writer and Service Account User |
| `DATABASE_URL` | Supabase session pooler URI |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY` | from Azure |
| `ELEVENLABS_API_KEY`, `FISH_AUDIO_API_KEY`, `GEMINI_API_KEY` | optional; a missing voice key degrades to the browser voice |

**Variables** (same page, Variables tab): `GCP_PROJECT_ID`, `CLOUD_RUN_REGION`,
`CLOUD_RUN_SERVICE`, `CORPUS_SNAPSHOT_ID`, `AZURE_OPENAI_API_VERSION`,
`AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`,
`ELEVENLABS_VOICE_ID`.

Create the service account:

```bash
gcloud iam service-accounts create clovbot-deployer --display-name="Clovbot CI"

for role in run.admin cloudbuild.builds.editor artifactregistry.writer iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "$(gcloud config get-value project)" \
    --member="serviceAccount:clovbot-deployer@$(gcloud config get-value project).iam.gserviceaccount.com" \
    --role="roles/${role}"
done

gcloud iam service-accounts keys create key.json \
  --iam-account="clovbot-deployer@$(gcloud config get-value project).iam.gserviceaccount.com"
```

Paste `key.json` into the `GCP_SA_KEY` secret, then **delete the local file** —
it is a credential and `.gitignore` will not save you if you move it.

### Operating it

```bash
npm run insights            # containment, refusal reasons, top unanswered questions
npm run insights -- 30      # over 30 days
npm run reproduce -- <turn-id>   # rebuild the exact context behind a past answer
```

Both read the turn log, which holds redacted member questions, so both are
command line only. Publishing a question log as a route would undo what
NFR-SEC-01 promises.

