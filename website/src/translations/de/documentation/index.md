# Dokumentation

Deepkit ist ein Open-Source-TypeScript-Framework für Backend-Anwendungen, frei unter der MIT-Lizenz verfügbar, entwickelt, um Ihnen beim Erstellen skalierbarer und wartbarer Backend-Anwendungen zu helfen. Es ist dafür ausgelegt, im Browser und in Node.js zu funktionieren, kann jedoch in jeder geeigneten JavaScript-Umgebung laufen.

Hier finden Sie Kapitel zu den verschiedenen Komponenten von Deepkit und API-Referenzen für alle unsere Pakete.

Wenn Sie Hilfe benötigen, treten Sie gerne unserem [Discord-Server](https://discord.com/invite/PtfVf7B8UU) bei oder eröffnen Sie ein Issue
auf [GitHub](https://github.com/deepkit/deepkit-framework).

## Kapitel


- [App](/documentation/app.md) - Schreiben Sie Ihre erste Anwendung mit Deepkit basierend auf der Befehlszeilenschnittstelle.
- [Framework](/documentation/framework.md) - Fügen Sie Ihrer Anwendung (HTTP/RPC-)Server, API-Dokumentation, Debugger, Integrationstests und mehr hinzu.
- [Runtime Types](/documentation/runtime-types.md) - Erfahren Sie mehr über TypeScript-Laufzeit-Typen sowie das Validieren und Transformieren von Daten.
- [Dependency Injection](/documentation/dependency-injection.md) - Dependency-Injection-Container, Inversion of Control und Abhängigkeitsumkehr.
- [Filesystem](/documentation/filesystem.md) - Dateisystemabstraktion zur einheitlichen Arbeit mit lokalen und entfernten Dateisystemen.
- [Broker](/documentation/broker.md) - Message-Broker-Abstraktion für verteilten L2-Cache, Pub/Sub, Queues, zentrale atomare Sperren oder Key-Value-Store.
- [HTTP](/documentation/http.md) - HTTP-Server-Abstraktion zum Aufbau typsicherer Endpunkte.
- [RPC](/documentation/rpc.md) - Abstraktion für Remote Procedure Calls, um Frontend mit Backend zu verbinden oder mehrere Backend-Dienste zu koppeln.
- [ORM](/documentation/orm.md) - ORM und DBAL, um Daten typsicher zu speichern und abzufragen.
- [Desktop-UI](/documentation/desktop-ui/getting-started) - Erstellen Sie GUI-Anwendungen mit dem auf Angular basierenden UI-Framework von Deepkit.

## API-Referenz

Im Folgenden finden Sie eine vollständige Liste aller Deepkit-Pakete mit Links zu deren API-Dokumentation.

### Komposition

- [@deepkit/app](/documentation/package/app.md)
- [@deepkit/framework](/documentation/package/framework.md)
- [@deepkit/http](/documentation/package/http.md)
- [@deepkit/angular-ssr](/documentation/package/angular-ssr.md)

### Infrastruktur

- [@deepkit/rpc](/documentation/package/rpc.md)
- [@deepkit/rpc-tcp](/documentation/package/rpc-tcp.md)
- [@deepkit/broker](/documentation/package/broker.md)
- [@deepkit/broker-redis](/documentation/package/broker-redis.md)

### Dateisystem

- [@deepkit/filesystem](/documentation/package/filesystem.md)
- [@deepkit/filesystem-ftp](/documentation/package/filesystem-ftp.md)
- [@deepkit/filesystem-sftp](/documentation/package/filesystem-sftp.md)
- [@deepkit/filesystem-s3](/documentation/package/filesystem-aws-s3.md)
- [@deepkit/filesystem-google](/documentation/package/filesystem-google.md)
- [@deepkit/filesystem-database](/documentation/package/filesystem-database.md)

### Datenbank

- [@deepkit/orm](/documentation/package/orm.md)
- [@deepkit/mysql](/documentation/package/mysql.md)
- [@deepkit/postgres](/documentation/package/postgres.md)
- [@deepkit/sqlite](/documentation/package/sqlite.md)
- [@deepkit/mongodb](/documentation/package/mongo.md)

### Grundlagen

- [@deepkit/type](/documentation/package/type.md)
- [@deepkit/event](/documentation/package/event.md)
- [@deepkit/injector](/documentation/package/injector.md)
- [@deepkit/template](/documentation/package/template.md)
- [@deepkit/logger](/documentation/package/logger.md)
- [@deepkit/workflow](/documentation/package/workflow.md)
- [@deepkit/stopwatch](/documentation/package/stopwatch.md)

### Werkzeuge

- [@deepkit/api-console](/documentation/package/api-console.md)
- [@deepkit/devtool](/documentation/package/devtool.md)
- [@deepkit/desktop-ui](/documentation/desktop-ui/getting-started.md)
- [@deepkit/orm-browser](/documentation/package/orm-browser.md)
- [@deepkit/bench](/documentation/package/bench.md)
- [@deepkit/run](/documentation/package/run.md)

### Kern

- [@deepkit/bson](/documentation/package/bson.md)
- [@deepkit/core](/documentation/package/core.md)
- [@deepkit/topsort](/documentation/package/topsort.md)

### Laufzeit

- [@deepkit/vite](/documentation/package/vite.md)
- [@deepkit/bun](/documentation/package/bun.md)
- [@deepkit/type-compiler](/documentation/package/type-compiler.md)