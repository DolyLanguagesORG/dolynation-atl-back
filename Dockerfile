# syntax=docker/dockerfile:1.7
# Multi-stage build for the Dolynglish NestJS backend.
# Build context is the root of this repository (dolynation-atl-back).
# Used by dolynation-tlalli-infra/docker-compose.prod.yml.

# ─── Stage 1: build ──────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies with the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the source and compile.
COPY . .
RUN npm run build && npm prune --omit=dev


# ─── Stage 2: runner ──────────────────────────────────────────────
FROM node:22-alpine AS runner

# Use the unprivileged "node" user that the official image provides.
USER node
WORKDIR /app

# Copy only what the runtime needs from the builder.
COPY --chown=node:node --from=builder /app/package.json /app/package-lock.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist

# El commit entra en la imagen para que /health pueda decir exactamente
# qué build está corriendo.
ARG GIT_COMMIT=unknown
ENV NODE_ENV=production \
    GIT_COMMIT=$GIT_COMMIT
EXPOSE 3333

CMD ["node", "dist/main.js"]