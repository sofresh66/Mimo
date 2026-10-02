# Application web Next.js (sortie « standalone ») — construite depuis la racine du monorepo :
#   docker build -f apps/web/Dockerfile --build-arg API_INTERNAL_URL=http://api:4000 .
FROM node:24-slim AS build
RUN npm install -g pnpm@10.34.6
WORKDIR /app
# Les réécritures /api et /socket.io sont figées au build : l'URL interne de l'API est un argument.
ARG API_INTERNAL_URL=http://api:4000
ARG NEXT_PUBLIC_APP_NAME=Mimo
ENV API_INTERNAL_URL=$API_INTERNAL_URL NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm install --frozen-lockfile --filter @mimo/web... \
  && pnpm --filter @mimo/web... build

FROM node:24-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
