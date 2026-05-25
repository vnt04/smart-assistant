# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @assistant/shared build
RUN pnpm --filter @assistant/backend build
RUN pnpm --filter @assistant/backend deploy --prod /prod/backend
RUN cp -r apps/backend/dist /prod/backend/dist

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S nodejs && adduser -S assistant -G nodejs
COPY --from=build --chown=assistant:nodejs /prod/backend ./
RUN mkdir -p /data/uploads && chown -R assistant:nodejs /data
USER assistant
EXPOSE 3000
CMD ["node", "dist/main.js"]
