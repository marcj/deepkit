# Deepkit Website

You are looking to change documentation? Go to ./src/pages/documentation

### Dev

Requires node v22.

Make sure `deepkit-website2` database exists in your local postgres.

```sh
npm run dev
```

## Translate

Translates the navigation, start page and documentation into the languages of `src/common/languages.ts`.
Only new or changed pages are translated (tracked in `src/translations/<lang>/state.json`).

By default it runs the [Claude Code](https://claude.com/claude-code) CLI (`claude -p`), so it uses whatever
Claude Code is logged in with, e.g. a Claude subscription. Log in once with `claude` and `/login`, then:

```sh
npm run translate de
```

`APP_CLAUDE_TRANSLATION_MODEL` picks a model (default: the Claude Code default).

To see what is not translated yet (missing labels, new or changed pages), without calling any model:

```sh
npm run translate:check      # every language that has translations
npm run translate:check de   # one language, add --verbose to list everything
```

It exits with 1 when something is missing, so it can run in CI.

To use the OpenAI API instead:

```sh
export APP_TRANSLATION_PROVIDER=openai
export APP_OPENAI_API_KEY=your_openai_api_key
npm run translate de
```

The OpenAI model can be changed with `APP_OPENAI_TRANSLATION_MODEL` (default `gpt-6.1-sol`).

## Build Docker image

```
cd website/
docker build -t website2 -f Dockerfile ../
docker run --rm -p 8080:8080 -e app_databaseHost=host.docker.internal website2
```

