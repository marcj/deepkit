# Performance

Deepkit kompiliert Routing, Parameter-Parsing, Validierung und Serialisierung jeder Route zu JavaScript-Funktionen. Ein Request ohne zusätzliche Listener oder Middlewares führt diese Funktionen dann direkt nacheinander aus.

## Was ein Request kostet

Ein Request durchläuft diese Schritte:

1. Route-Matching (eine kompilierte Funktion für alle Routen)
2. Parameter-Parsing und Validierung von Pfad, Query, Headern und Body (pro Route kompiliert)
3. Erstellen des Controllers im Dependency-Injection-Scope des Requests und Aufruf der Action
4. Serialisieren des Ergebnisses anhand des Rückgabetyps (pro Route kompiliert) und Schreiben der Response

Solange kein Listener für die Zustände bis zum Controller registriert ist (siehe [Events](./events.md)), laufen diese Schritte direkt ab. Ein Listener (z. B. ein Auth-Listener auf `httpWorkflow.onAuth`) oder eine Middleware führt dazu, dass der Request stattdessen den Event-Workflow durchläuft, der pro Zustand ein Event-Objekt erstellt. Fehler, nicht gefundene Routen und Listener auf `onResponse` (wie das HTTP-Access-Log) werden erst dann an den Workflow übergeben, wenn sie auftreten, sodass ein erfolgreicher Request auf dem direkten Pfad bleibt.

## Benchmarks

Gemessen auf unserer Benchmark-Maschine (Intel Core i9-8950HK, 12 Threads, Linux, Node.js 26.13, Bun 1.4.4, Deno 2.9.6): die CPU-Zeit des Serverprozesses pro Request (niedriger ist besser), mit 200 gleichzeitigen Verbindungen von [autocannon](https://github.com/mcollina/autocannon) auf derselben Maschine, Median aus drei Durchläufen. Die CPU-Zeit ist hier aussagekräftiger als Requests pro Sekunde, da der Lastgenerator auf derselben Maschine lange vor dem Server zum Engpass wird.

`GET /hello` gibt `{hello: 'world'}` zurück. Die beiden POST-Routen validieren einen JSON-Body mit verschachtelten Objekten, Arrays, Datumswerten und Zahlenbereichen (zod für Hono, ein TypeScript-Typ für Deepkit) und antworten mit einem kleinen JSON: 1,8KB (ein Teilnehmer mit 10 GPS-Punkten) und 357KB (200 Teilnehmer mit je 10 Punkten). Für Node.js und Bun ist die User-CPU-Zeit angegeben, also die Arbeit von JavaScript, ohne die System-Zeit für das Netzwerk, die für alle gleich ist.

### Node.js

| | GET /hello | POST 1,8KB | POST 357KB |
|---|---|---|---|
| node:http (kein Routing, keine Validierung) | 17,4µs | – | – |
| Hono + @hono/node-server + zod | 22,5µs | 80,8µs | 5,63ms |
| **Deepkit** | **21,0µs** | **66,3µs** | **4,53ms** |

### Bun

| | GET /hello | POST 1,8KB | POST 357KB |
|---|---|---|---|
| Bun.serve mit eigenem Router (keine Validierung) | 5,9µs | 37,3µs | – |
| Hono + Bun.serve + zod | 8,5µs | 42,1µs | 4,15ms |
| **Deepkit** mit `Bun.serve` und `kernel.fetch` | **9,7µs** | **41,6µs** | **2,38ms** |
| Deepkit mit Buns `node:http` | 15,4µs | – | – |

Bun ist mit `Bun.serve` deutlich schneller als mit seiner `node:http`-Kompatibilitätsschicht. Verwende `kernel.fetch`, siehe [Server & Runtimes](./runtimes.md#bun).

### Deno

User- und System-CPU-Zeit pro Request für `GET /hello`: `Deno.serve` ohne Routing 11,7µs, Hono 14,7µs, Deepkit mit `kernel.fetch` 18,9µs.

### Nur Validierung und Deserialisierung

Dieselben Daten ohne HTTP: 2.000 GPS-Punkte mit jeweils einem Datum, bereits aus JSON geparst.

| | Node.js | Bun |
|---|---|---|
| zod `parse` (mit `z.coerce.date()`) | 2,37ms | 2,30ms |
| Deepkit `cast` (deserialisieren und validieren) | 1,49ms | 1,14ms |
| zod `safeParse`, numerische Timestamps statt Datumswerten | 1,38ms | 1,48ms |
| Deepkit-Validator, numerische Timestamps | 0,21ms | 0,14ms |
| `JSON.parse` derselben 357KB | 2,24ms | 0,99ms |

Ohne Datumskonvertierung ist die Validierung selbst 7x (Node.js) bis 10x (Bun) schneller. Mit Datumswerten entfallen 0,77ms dieser Zeit auf das Erstellen von 2.000 `Date`-Objekten, was für jede Library gleich ist. Und das Parsen des JSON dauert etwa so lange wie dessen Validierung.

## Tipps

- **Gib nach Möglichkeit einfache Objekte aus synchronen Actions zurück.** Synchrone Actions werden ohne ein Promise pro Request verarbeitet.
- **Annotiere Rückgabetypen** (`hello(): { hello: string }`). Das Ergebnis wird dann mit einer kompilierten Funktion serialisiert, und Properties, die nicht Teil des Typs sind, werden nicht gesendet.
- **Setze Middlewares und Listener bevorzugt nur für Routen ein, die sie benötigen.** Verwende `httpMiddleware.for(...).forControllers(...)` oder prüfe die Route im Listener, da jeder Listener auf den Zuständen bis zum Controller alle Requests in den Event-Workflow verschiebt.
- **Das HTTP-Access-Log** (`FrameworkModule`-Option `httpLog`) formatiert und schreibt eine Zeile pro Request. Schalte es ab, wenn ein Load Balancer oder Proxy Requests bereits loggt.
- **Rufe `kernel.warmUp()`** beim Start auf, damit die ersten Requests keine Routen kompilieren. In Cloudflare Workers erforderlich.
- **Verwende unter Bun und Deno `kernel.fetch`** mit `Bun.serve`/`Deno.serve` statt der `node:http`-Kompatibilitätsschichten.

## Serverless und Cold Starts

Das Erstellen der App (Module, Dependency-Injection-Container, Router) dauert einige Millisekunden; mit `warmUp()` zusätzlich die Kompilierung aller Routen. Auf der Benchmark-Maschine mit Node.js dauerten das Importieren von Deepkit und das Validieren des ersten Payloads von 2.000 GPS-Punkten 87ms (zod: 93ms), die ersten 100 Payloads einschließlich dessen 459ms (zod: 607ms). Mit Bun: 61ms und 296ms (zod: 47ms und 436ms). Die Kompilierung bei der ersten Verwendung amortisiert sich nach wenigen Aufrufen.

Ob der Start ins Gewicht fällt, hängt davon ab, wie viele Requests eine Instanz bedient: Lambda, Cloud Run und ähnliche Plattformen verwenden eine Instanz für viele Requests wieder, sodass der Start einmal pro Instanz anfällt, nicht pro Request. Auf Plattformen, die pro Request eine Instanz starten, zählt der Start jedes Frameworks bei jedem Request.
