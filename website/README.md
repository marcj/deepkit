# Deepkit Website

You are looking to change documentation? Go to ./src/pages/documentation

### Dev

Requires node v22.

Make sure `deepkit-website2` database exists in your local postgres.

```sh
npm run dev
```

## Build Docker image

```
cd website/
docker build -t website2 -f Dockerfile ../
docker run --rm -p 8080:8080 -e app_databaseHost=host.docker.internal website2
```

