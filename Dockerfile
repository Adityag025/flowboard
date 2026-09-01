# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# FlowBoard production image.
#
# Multi-stage, for two reasons that both matter:
#   SIZE     -- the final image carries no build toolchain, no devDependencies
#               and no source, just the compiled server and its runtime deps.
#   SECURITY -- a smaller image has less to exploit, and secrets used at build
#               time never reach the final layers.
#
# Next's `standalone` output is what makes this work: it traces the modules the
# app actually imports and emits a self-contained server, so the runtime stage
# does not need node_modules at all.
# ---------------------------------------------------------------------------

ARG NODE_VERSION=24-alpine

# ---------------------------------------------------------------------------
# deps -- install once, cached on the lockfile alone
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# Only the manifests, so this layer is reused on every build that does not
# change dependencies. Copying the whole source here would invalidate the
# install cache on every code edit -- the single most common Dockerfile mistake.
COPY package.json package-lock.json ./

# npm ci, not install: installs exactly the lockfile and fails on drift.
RUN npm ci

# ---------------------------------------------------------------------------
# builder -- generate the Prisma client and build Next
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The Prisma client is generated code and gitignored, so nothing compiles
# until this runs.
RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1

# Build-time placeholders are set INLINE on this RUN, not with ENV.
#
# ENV writes the value into an image layer, where it is recoverable with
# `docker history` by anyone who can pull the image. These particular values are
# throwaway -- the build imports modules that read them, but every route touching
# the database is dynamic so nothing connects at build time -- yet the PATTERN is
# what matters: buildkit flags it (SecretsUsedInArgOrEnv), and a warning people
# learn to ignore is how a real secret eventually ships. Inline on RUN, the
# variables exist only for that command's process.
#
# Real values arrive as runtime environment variables.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" \
    AUTH_SECRET="build-time-placeholder-not-a-real-secret" \
    npm run build

# ---------------------------------------------------------------------------
# runner -- the shipped image
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# A NON-ROOT user. Containers run as root by default, which means a process
# escape starts with root in the container -- and with a writable bind mount,
# potentially on the host.
# -G nodejs is load-bearing: without it busybox's adduser puts the user in
# `nogroup`, and the files COPY --chown'ed to the nodejs group would be owned by
# a group the process is not a member of. Harmless while files are also
# user-owned, but it silently breaks the moment anything relies on group
# permissions.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 -G nodejs nextjs

# `standalone` traces exactly the modules the server imports, so no npm install
# happens here and devDependencies never ship.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Migrations and schema, so the image can run `prisma migrate deploy` as a
# release step rather than needing a separate toolchain image.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs

EXPOSE 3000

# Liveness, not readiness -- see the comment in src/app/api/health/route.ts.
# Pointing a container healthcheck at the deep check would restart every
# instance during a brief database blip.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
