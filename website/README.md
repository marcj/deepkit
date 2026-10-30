# Deepkit Website

You are looking to change documentation? Go to ./src/pages/documentation

### Dev

Requires node v22.

Make sure `deepkit-website2` database exists in your local postgres.

```sh
npm run dev
```

## Translate

Translates the navigation, start page and documentation with OpenAI into one of `de`, `ja`, `ko`, `pl`, `zh`.
Only new or changed pages are translated (tracked in `src/translations/<lang>/state.json`).

```sh
export APP_OPENAI_API_KEY=your_openai_api_key
npm run translate de
```

The model can be changed with `APP_OPENAI_TRANSLATION_MODEL` (default `gpt-6.1-sol`).

## Build Docker image

```
cd website/
docker build -t website2 -f Dockerfile ../
docker run --rm -p 8080:8080 -e app_databaseHost=host.docker.internal website2
```

