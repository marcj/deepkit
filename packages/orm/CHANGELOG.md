# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.0.18](https://github.com/deepkit/deepkit-framework/compare/v1.0.17...v1.0.18) (2025-09-22)

**Note:** Version bump only for package @deepkit/orm

## [1.0.15](https://github.com/deepkit/deepkit-framework/compare/v1.0.14...v1.0.15) (2025-06-26)

### Features

- **desktop-ui:** refactor to standalone/signal, update angular to v20, new website docs ([#657](https://github.com/deepkit/deepkit-framework/issues/657)) ([a39d26c](https://github.com/deepkit/deepkit-framework/commit/a39d26cd527947cb93c113434f1a29f4cc014d22))

## [1.0.14](https://github.com/deepkit/deepkit-framework/compare/v1.0.13...v1.0.14) (2025-06-22)

### Features

- **mongo:** explain() and allowDiskUse on aggregations ([cefcd96](https://github.com/deepkit/deepkit-framework/commit/cefcd96ce3cbc10d7c521edc0bf6e03aef85759e))
- **mongo:** implement Query.logExplain, to log the explain() query on next operation ([aae9a64](https://github.com/deepkit/deepkit-framework/commit/aae9a642da141495eb83c9334bafb9d890051601))
- **orm:** add explain() API ([c34370a](https://github.com/deepkit/deepkit-framework/commit/c34370aa7da1ee4d5ca9f7e3ff8ad240fc7aa999))

## [1.0.12](https://github.com/deepkit/deepkit-framework/compare/v1.0.11...v1.0.12) (2025-06-05)

**Note:** Version bump only for package @deepkit/orm

## [1.0.11](https://github.com/deepkit/deepkit-framework/compare/v1.0.10...v1.0.11) (2025-06-02)

**Note:** Version bump only for package @deepkit/orm

## [1.0.9](https://github.com/deepkit/deepkit-framework/compare/v1.0.8...v1.0.9) (2025-05-23)

**Note:** Version bump only for package @deepkit/orm

## [1.0.8](https://github.com/deepkit/deepkit-framework/compare/v1.0.7...v1.0.8) (2025-05-20)

**Note:** Version bump only for package @deepkit/orm

## [1.0.5](https://github.com/deepkit/deepkit-framework/compare/v1.0.4...v1.0.5) (2025-04-02)

**Note:** Version bump only for package @deepkit/orm

## [1.0.3](https://github.com/deepkit/deepkit-framework/compare/v1.0.2...v1.0.3) (2025-03-13)

### Features

- **event:** align API with Event web standards ([0e1dca2](https://github.com/deepkit/deepkit-framework/commit/0e1dca28fd8bbfb5232f9f9df4654598744d77a0))
- **injector:** improve error messages, make it very clear what failed and where providers are located ([5866eda](https://github.com/deepkit/deepkit-framework/commit/5866eda8ece1705bb9d1df655d53c70cd77f43a8))
- **mongo,orm,logger:** improve transaction safety and logging ([95faf2c](https://github.com/deepkit/deepkit-framework/commit/95faf2c0143a34ba3524db290719692cc93593d3))
- **mongo:** add support for read preference via Query API ([c829762](https://github.com/deepkit/deepkit-framework/commit/c829762ef6ec1f4b9a57c89d19f09dce39e5b940))
- **rpc:** automatically garbage collect observables + new event system + stats collection ([d727232](https://github.com/deepkit/deepkit-framework/commit/d727232ca4b445a6bc82de8df31e25ba2d60d683))

### BREAKING CHANGES

- **event:** stopPropagation() becomes stopImmediatePropagation().

New BaseEvent.preventDefault() which replaces custom solutions like stop() in DatabaseEvent.

## [1.0.2](https://github.com/deepkit/deepkit-framework/compare/v1.0.1...v1.0.2) (2025-02-24)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.160...v1.0.1) (2025-02-24)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.160](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.159...v1.0.1-alpha.160) (2025-02-18)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.158](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.157...v1.0.1-alpha.158) (2025-02-15)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.157](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.156...v1.0.1-alpha.157) (2025-02-15)

### Bug Fixes

- tsconfig and tsc build ([ac71e83](https://github.com/deepkit/deepkit-framework/commit/ac71e838d542a3cab0e9b1cfc20b27637f1c01df))

### Features

- update to angular 19 and typescript 5.7.3, new @deepkit/angular-ssr package ([#627](https://github.com/deepkit/deepkit-framework/issues/627)) ([52333a7](https://github.com/deepkit/deepkit-framework/commit/52333a71f98c7e25a74f048dd57f1efba61098f5))

## [1.0.1-alpha.156](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.155...v1.0.1-alpha.156) (2025-01-30)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.155](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.154...v1.0.1-alpha.155) (2024-10-30)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.154](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.153...v1.0.1-alpha.154) (2024-09-06)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.153](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.152...v1.0.1-alpha.153) (2024-06-06)

### Bug Fixes

- **orm:** correctly resolve reference class schemas ([e193325](https://github.com/deepkit/deepkit-framework/commit/e193325b561563f0207403103cd8caf859228cc2))

### Features

- **orm:** support passing type to Database.persistAs/Database.removeAs, DatabaseSession.addAs ([6679aba](https://github.com/deepkit/deepkit-framework/commit/6679aba8517b46575b92edaa3a9f59ea90f9f762)), closes [#571](https://github.com/deepkit/deepkit-framework/issues/571)

## [1.0.1-alpha.151](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.150...v1.0.1-alpha.151) (2024-05-14)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.150](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.149...v1.0.1-alpha.150) (2024-05-09)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.149](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.148...v1.0.1-alpha.149) (2024-05-07)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.148](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.147...v1.0.1-alpha.148) (2024-05-04)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.147](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.146...v1.0.1-alpha.147) (2024-05-04)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.146](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.145...v1.0.1-alpha.146) (2024-04-17)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.145](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.144...v1.0.1-alpha.145) (2024-04-08)

### Bug Fixes

- **orm:** make sure persistence is always closed on flush ([015d90a](https://github.com/deepkit/deepkit-framework/commit/015d90af15503c4159e4810cb6f862349a4599f1))

## [1.0.1-alpha.143](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.142...v1.0.1-alpha.143) (2024-03-17)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.142](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.141...v1.0.1-alpha.142) (2024-03-06)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.141](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.140...v1.0.1-alpha.141) (2024-03-05)

### Bug Fixes

- **orm:** remove browser export ([58bb3c8](https://github.com/deepkit/deepkit-framework/commit/58bb3c864e6d4fb2794835e748cf5a950bf923af))

## [1.0.1-alpha.140](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.139...v1.0.1-alpha.140) (2024-03-02)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.139](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.138...v1.0.1-alpha.139) (2024-02-29)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.138](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.137...v1.0.1-alpha.138) (2024-02-27)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.137](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.136...v1.0.1-alpha.137) (2024-02-26)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.133](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.132...v1.0.1-alpha.133) (2024-02-15)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.132](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.131...v1.0.1-alpha.132) (2024-02-10)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.131](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.130...v1.0.1-alpha.131) (2024-02-09)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.128](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.127...v1.0.1-alpha.128) (2024-02-06)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.124](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.123...v1.0.1-alpha.124) (2024-02-04)

### Bug Fixes

- **orm:** make sure getJoin operates on existing join model ([03b2428](https://github.com/deepkit/deepkit-framework/commit/03b242832adac48b7163e1fcf8902e7f1b197e8a))

### Features

- **orm:** better Error handling + UniqueConstraintFailure ([f1845ee](https://github.com/deepkit/deepkit-framework/commit/f1845ee84eb61a894155944a6efae6b926a4a47d))
- **orm:** new API to configure a join query ([64cc55e](https://github.com/deepkit/deepkit-framework/commit/64cc55e812a6be555515e036de4e6b18d147b4f0))

## [1.0.1-alpha.123](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.122...v1.0.1-alpha.123) (2024-02-02)

### Features

- **orm:** onDatabaseError event ([cdb7256](https://github.com/deepkit/deepkit-framework/commit/cdb7256b34f1d9de16145dd79b307ccf45f7c72f))

## [1.0.1-alpha.122](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.121...v1.0.1-alpha.122) (2024-01-31)

### Features

- **injector:** new Module.configureProvider<T>(Fn) with configuration callback ([1739b95](https://github.com/deepkit/deepkit-framework/commit/1739b9564dcf4d254dd3041dc71945290e06ad4c))

## [1.0.1-alpha.121](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.120...v1.0.1-alpha.121) (2024-01-31)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.120](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.119...v1.0.1-alpha.120) (2024-01-29)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.119](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.118...v1.0.1-alpha.119) (2024-01-28)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.118](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.117...v1.0.1-alpha.118) (2024-01-27)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.117](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.116...v1.0.1-alpha.117) (2024-01-26)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.116](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.115...v1.0.1-alpha.116) (2024-01-22)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.115](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.114...v1.0.1-alpha.115) (2024-01-21)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.114](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.113...v1.0.1-alpha.114) (2024-01-21)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.113](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.112...v1.0.1-alpha.113) (2024-01-17)

### Features

- **orm:** remove rxjs dependency ([0d9dfe1](https://github.com/deepkit/deepkit-framework/commit/0d9dfe1f80bfc34bfa12a4ffaa2fd203865d942b))

## [1.0.1-alpha.112](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.111...v1.0.1-alpha.112) (2024-01-16)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.111](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.110...v1.0.1-alpha.111) (2024-01-15)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.110](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.109...v1.0.1-alpha.110) (2024-01-11)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.109](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.108...v1.0.1-alpha.109) (2024-01-10)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.108](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.107...v1.0.1-alpha.108) (2023-11-21)

**Note:** Version bump only for package @deepkit/orm

## [1.0.1-alpha.105](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.103...v1.0.1-alpha.105) (2023-10-23)

### Bug Fixes

- **orm:** correctly instantiate database class per module ([1ea2418](https://github.com/deepkit/deepkit-framework/commit/1ea24186232c73412bea8490f4b2eb4c30511122))
- **type:** do not interfere with type checking when intersecting multiple type annotations. ([af85f1f](https://github.com/deepkit/deepkit-framework/commit/af85f1ff48c4be9fbd9a2ecd46e7f97b0bbb28c7))
