#!/bin/sh
node dist/app/server/server.mjs migrate
node dist/app/server/server.mjs search:index

app_environment=prod app_framework_port=$PORT node dist/app/server/server.mjs server:start
