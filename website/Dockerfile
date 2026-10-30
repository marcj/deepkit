FROM node:24-alpine3.20
ENV TZ="Europe/Berlin"

RUN mkdir /app/
WORKDIR /app

RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++ \
    libc-dev \
    linux-headers \
    libstdc++ \
    && ln -sf python3 /usr/bin/python

ADD .git /app/.git

ADD package.json lerna.json tsconfig.json tsconfig.esm.json sync-tsconfig-deps.js install-compiler.sh /app/
ADD .yarnrc.yml yarn.lock /app/
ADD .yarn /app/.yarn

ADD packages /app/packages
RUN rm -rf /app/packages/devtool
RUN rm -rf /app/packages/orm-browser-gui
RUN rm -rf /app/packages/framework-debug-gui
RUN rm -rf /app/packages/api-console-gui
ADD website/package.json /app/website/package.json

RUN node sync-tsconfig-deps.js
RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn yarn install --inline-builds

ADD website /app/website
RUN npm run build

FROM node:24-alpine3.20
ENV TZ="Europe/Berlin"

EXPOSE 8080
ENV PORT=8080

RUN mkdir /app/

ADD package.json /app/package.json
ADD .yarnrc.yml yarn.lock /app/
ADD .yarn /app/.yarn
ADD packages/ui-library/package.json /app/packages/ui-library/package.json
ADD website/package.json /app/website/package.json
RUN cd /app && yarn workspaces focus website --production

COPY --from=0 /app/website/dist /app/website/dist
COPY --from=0 /app/website/src /app/website/src

ADD website/docker_start.sh /app/website/start.sh

WORKDIR /app/website

CMD sh start.sh
