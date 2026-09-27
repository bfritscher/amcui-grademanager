FROM node:20 AS builder
WORKDIR /app
COPY package.json .
RUN npm install
COPY . /app
ARG VITE_COMMITHASH
ENV VITE_COMMITHASH=${VITE_COMMITHASH}
ENV SENTRY_RELEASE=${VITE_COMMITHASH}
RUN npm run test:unit:ci
RUN npm run build

FROM nginx
LABEL org.opencontainers.image.source=https://github.com/bfritscher/amcui-grademanager
COPY ./nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY ./nginx/inject-env.sh /docker-entrypoint.d/inject-env.sh
RUN chmod +x /docker-entrypoint.d/inject-env.sh
COPY --from=builder /app/dist /usr/share/nginx/html
