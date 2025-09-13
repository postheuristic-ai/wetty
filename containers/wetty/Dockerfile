FROM node:18-alpine as base
RUN apk add -U build-base python3 py3-setuptools
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN npx pnpm i -g pnpm@latest
WORKDIR /usr/src/app
COPY . /usr/src/app

FROM base AS prod-deps
# Skip prepare script (husky) in production, but allow other install scripts for native modules
ENV npm_config_ignore_scripts=true
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile
ENV npm_config_ignore_scripts=false
# Rebuild only the native modules we need
RUN pnpm rebuild node-pty gc-stats

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM node:18-alpine
LABEL maintainer="butlerx@notthe.cloud"
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /usr/src/app
ENV NODE_ENV=production
EXPOSE 3000
COPY --from=prod-deps /usr/src/app/node_modules /usr/src/app/node_modules
COPY --from=build /usr/src/app/build /usr/src/app/build
COPY package.json /usr/src/app
RUN apk add -U coreutils openssh-client sshpass && \
    mkdir ~/.ssh

ENTRYPOINT [ "node", "build/main.js" ]
CMD [ ]
