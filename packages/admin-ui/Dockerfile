FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/admin-ui/package.json packages/admin-ui/package.json
# Increase npm network retries and timeout to make builds more resilient in flaky networks
ENV NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
    NPM_CONFIG_FETCH_TIMEOUT=600000
RUN npm ci --workspace packages/admin-ui --include-workspace-root --no-audit

COPY packages/admin-ui packages/admin-ui
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build --workspace packages/admin-ui

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/packages/admin-ui/dist /usr/share/nginx/html
COPY packages/admin-ui/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
