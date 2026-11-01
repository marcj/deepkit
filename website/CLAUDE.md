# Website

Deploy: build `website/Dockerfile` for linux/amd64 from a clean clone of pushed `master`, transfer it with `docker save | docker load` to the production server and switch the image tag there (hosts, paths and containers are in `website/deploy.env`, not checked in).
Translate: `npm run translate <lang>` translates new and changed texts, `npm run translate:check` lists what is still missing.
