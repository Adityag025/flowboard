#!/usr/bin/env bash
# Provisions the Vercel-managed Postgres and wires it up.
#
# PREREQUISITE, and it cannot be automated: accept the Neon marketplace terms
# once, in a browser:
#
#   https://vercel.com/aditya-gupta-s-ehswatch/~/integrations/accept-terms/neon?source=cli
#
# Accepting a third-party legal agreement is the account owner's decision, so the
# CLI deliberately refuses to proceed without it and this script does not try to
# work around that.
#
# Then: ./scripts/finish-db-setup.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Provisioning Postgres via the Vercel Neon integration"
# --environment production only: preview deployments sharing the production
# database would let a PR branch migrate or truncate real data.
vercel integration add neon \
  --name flowboard-db \
  --environment production \
  --format json

echo
echo "==> Environment variables now on the project"
vercel env ls

echo
echo "==> Pulling the connection string locally (gitignored)"
vercel env pull .vercel/.env.production.local --environment=production --yes >/dev/null

# The integration names its variable DATABASE_URL or POSTGRES_URL depending on
# the provider; accept either and normalise to what the app expects.
DB_URL=$(grep -oE '^(DATABASE_URL|POSTGRES_URL|DATABASE_URL_UNPOOLED)="[^"]+"' \
  .vercel/.env.production.local | head -1 | cut -d'"' -f2 || true)

if [ -z "${DB_URL:-}" ]; then
  echo "!! No database URL found. Check 'vercel env ls' and set DATABASE_URL manually." >&2
  exit 1
fi

# Never echo the URL itself -- it contains the password.
echo "==> Found a connection string (host: $(echo "$DB_URL" | sed -E 's|.*@([^/:]+).*|\1|'))"

if ! grep -q '^DATABASE_URL=' .vercel/.env.production.local; then
  echo "==> Aliasing it to DATABASE_URL, which is the name the app reads"
  vercel env add DATABASE_URL production --value "$DB_URL" --yes
fi

echo
echo "==> Applying migrations (release step -- never in the build command)"
DATABASE_URL="$DB_URL" npx prisma migrate deploy

echo
echo "==> Verifying the schema landed"
DATABASE_URL="$DB_URL" npx prisma migrate status

echo
echo "==> Redeploying so the running instance picks up DATABASE_URL"
vercel deploy --prod --yes

echo
echo "==> Health check"
curl -s "https://flowboard-theta-ten.vercel.app/api/health?check=deep"
echo
echo "Done. Sign up at https://flowboard-theta-ten.vercel.app/signup -- a workspace"
echo "is created automatically, so no seeding is required."
