# Deployment

> Extracted from the README. The frontend is a static build on Vercel; the API is a container on Cloud Run. Vercel proxies `/api/*` to Cloud Run, which keeps the session cookie first-party.

### Before deploying P2 (the authenticated tier)

Both steps below are irreversible against the production database and are yours to run.

**1. Apply the migrations, in order.** Everything from P2 that has not reached production yet:

```
migrations/005_contract_wildcard.sql   # contract-wide documents reachable from any contract
migrations/006_drugs_and_routing.sql   # typed drug rows, and the router's decision per turn
migrations/007_corpus_snapshots.sql    # when the documents were fetched and indexed
migrations/008_member_records.sql      # five synthetic members and their records
migrations/009_member_login.sql        # one-time codes and member sessions
migrations/010_needs_login_outcome.sql # let a turn record the outcome "needs_login"
migrations/011_row_level_security.sql  # member scoping enforced by the database
migrations/012_member_access_log.sql   # one audit row per authenticated turn
migrations/013_login_path_under_rls.sql # repairs sign-in, which 011 broke
migrations/014_language_scoped_retrieval.sql # Spanish chunks, scoped before ranking
migrations/015_caches.sql               # answer, embedding and audio caches
migrations/016_feedback.sql             # the answer rated, why, and a session-blind view
```

**014 must be followed by a re-ingest.** It adds a language to every chunk and
replaces `search_hybrid` with a nine-argument version; the old eight-argument
one is dropped, because leaving both would make an eight-argument call
ambiguous. Run `npm run ingest` after applying it.

**Re-running ingest clears the answer cache for that snapshot**, on failure as
well as success, so a corpus change is never answered from before it. Embeddings
and audio survive: neither can go stale, and clearing them would re-pay a
provider call for nothing.

**015 replaces a filesystem cache.** Synthesised audio moves from `data/audio`
into the database, so a recording survives a restart and is shared between Cloud
Run instances. Nothing is lost by not migrating the old directory: every entry
is derivable again from the providers.

**013 is not optional.** 011 put `members` behind a policy, and both sign-in
paths read that table before any identity exists to satisfy it, so no code could
be issued and no session resolved. Applying 011 without 013 leaves sign-in
silently broken.

**011 has a prerequisite and changes how the service connects.** Create the role
first, with a password of your choosing that never enters the repository:

```sql
create role clovbot_app login password '<yours>' nobypassrls;
```

Then apply 011 as the admin role, and set `DATABASE_APP_URL` to that role's
connection string. `DATABASE_URL` stays the admin connection and is what
migrations, `npm run ingest` and `npm run seed:members` use. The service reads
only `DATABASE_APP_URL` and refuses to start without it, so a missing value
fails the deploy rather than silently reconnecting as the role that can read
every member. Add it to the Cloud Run environment and to the CI secrets.

Prove it holds:

```bash
npm run check:rls      # no member's rows reachable from another's session
npm run check:audit    # every authenticated read recorded, and unalterable
```

To reverse, in this order: `013_login_path_under_rls_down.sql`,
`012_member_access_log_down.sql`, `011_row_level_security_down.sql`. The 012
rollback leaves the log table itself in place; dropping an audit trail is a
separate, deliberate act.

Each is additive and guarded with `if not exists` or `if exists`, so re-running one is safe.
Without 010 a gated question still answers, but the turn row is rejected and the
sign-in card is replaced by an error.

**2. Seed and index.** After the migrations:

```bash
npm run corpus:discover && npm run corpus:fetch && npm run corpus:convert
npm run ingest          # chunks, typed drug rows, and the corpus dates
npm run seed:members    # the five synthetic members
```

**3. Set the three new secrets** before `npm run deploy:api`, which forwards them:

| Variable | What it is |
| --- | --- |
| `RESEND_API_KEY` | Resend key for the verified sending domain |
| `OTP_FROM_ADDRESS` | `Clovbot <clovbot@v-ai.org>` |
| `OPERATOR_MEMBER_EMAILS` | Five addresses in member-id order, comma separated |

Without `OPERATOR_MEMBER_EMAILS` the members keep unreachable `@example.invalid` addresses and nobody can sign in. That is the correct default for a checkout, and the wrong one for a demo.

**One thing to know about a public deploy.** Anyone who guesses a seeded address can make the site email a code to that inbox, capped at ten an hour per address and thirty per IP. A code is useless without the inbox, so the worst case is nuisance mail.

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

Paste `key.json` into the `GCP_SA_KEY` secret, then **delete the local file**:
it is a credential and `.gitignore` will not save you if you move it.

### Security checks before a deploy

```bash
npm audit --audit-level=critical   # what CI gates on
npm run check:rls                  # no member's rows reachable from another's session
npm run check:audit                # every authenticated read recorded, and unalterable
```

Four high-severity advisories are open and have no fix available, all through the
local reranker. They are documented individually with reachability reasoning in
[docs/security.md](./security.md) §6, and CI reports rather than blocks on them so
the pipeline fails only on something actionable.

### Operating it

```bash
npm run insights            # containment, refusal reasons, top unanswered questions
npm run insights -- 30      # over 30 days
npm run reproduce -- <turn-id>   # rebuild the exact context behind a past answer
```

Both read the turn log, which holds redacted member questions, so both are
command line only. Publishing a question log as a route would undo what
NFR-SEC-01 promises.

