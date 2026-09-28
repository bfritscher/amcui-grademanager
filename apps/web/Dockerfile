FROM node:20 AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/exam-core/package.json packages/exam-core/package.json
RUN npm ci --workspace=amcui-grademanager --workspace=@amcui/exam-core --include-workspace-root --legacy-peer-deps
COPY packages/exam-core packages/exam-core
COPY apps/web apps/web
ARG VITE_COMMITHASH
ENV VITE_COMMITHASH=${VITE_COMMITHASH}
ENV SENTRY_RELEASE=${VITE_COMMITHASH}
ENV AMCUI_DISABLE_SENTRY=true
RUN npm run build:core && npm run test:web && npm run build --workspace=amcui-grademanager

FROM nginx
LABEL org.opencontainers.image.source=https://github.com/bfritscher/amcui-grademanager
COPY apps/web/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/nginx/inject-env.sh /docker-entrypoint.d/inject-env.sh
RUN chmod +x /docker-entrypoint.d/inject-env.sh
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
