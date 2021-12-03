FROM node:16 as builder
WORKDIR /app
COPY package.json .
RUN yarn
RUN yarn global add @quasar/cli
COPY . /app
RUN yarn run test:unit:ci
RUN quasar build

FROM nginx
COPY ./nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY ./nginx/inject-env.sh /docker-entrypoint.d/inject-env.sh
RUN chmod +x /docker-entrypoint.d/inject-env.sh
COPY --from=builder /app/dist/spa /usr/share/nginx/html
