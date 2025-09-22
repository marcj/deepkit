# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.0.18](https://github.com/deepkit/deepkit-framework/compare/v1.0.17...v1.0.18) (2025-09-22)

### Bug Fixes

- **mongo:** stop printing verbose stuff in mongosh ([d579a5a](https://github.com/deepkit/deepkit-framework/commit/d579a5ab582ebb154056945f9d5ca86e71cb6781))

## [1.0.17](https://github.com/deepkit/deepkit-framework/compare/v1.0.16...v1.0.17) (2025-07-03)

### Bug Fixes

- **mongo:** don't throw when index already exists ([6a4e194](https://github.com/deepkit/deepkit-framework/commit/6a4e19474aac20f66c140470796eaf38e402906e))

## [1.0.15](https://github.com/deepkit/deepkit-framework/compare/v1.0.14...v1.0.15) (2025-06-26)

### Features

- **desktop-ui:** refactor to standalone/signal, update angular to v20, new website docs ([#657](https://github.com/deepkit/deepkit-framework/issues/657)) ([a39d26c](https://github.com/deepkit/deepkit-framework/commit/a39d26cd527947cb93c113434f1a29f4cc014d22))

## [1.0.14](https://github.com/deepkit/deepkit-framework/compare/v1.0.13...v1.0.14) (2025-06-22)

### Features

- **mongo:** explain() and allowDiskUse on aggregations ([cefcd96](https://github.com/deepkit/deepkit-framework/commit/cefcd96ce3cbc10d7c521edc0bf6e03aef85759e))
- **mongo:** implement Query.logExplain, to log the explain() query on next operation ([aae9a64](https://github.com/deepkit/deepkit-framework/commit/aae9a642da141495eb83c9334bafb9d890051601))
- **mongo:** support collation/hint option and new explain() API ([77dfde8](https://github.com/deepkit/deepkit-framework/commit/77dfde8d0f39b9a35af28a886b97e5cf5dce9341))

## [1.0.12](https://github.com/deepkit/deepkit-framework/compare/v1.0.11...v1.0.12) (2025-06-05)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.11](https://github.com/deepkit/deepkit-framework/compare/v1.0.10...v1.0.11) (2025-06-02)

### Bug Fixes

- **mongo:** raw command return type of findOneOrUndefined ([9cc14ae](https://github.com/deepkit/deepkit-framework/commit/9cc14ae10755627a083cd2fd21e507876fab5459))

## [1.0.9](https://github.com/deepkit/deepkit-framework/compare/v1.0.8...v1.0.9) (2025-05-23)

### Bug Fixes

- **mongo:** make sure finalizer is removed when transaction committed/rolled back ([14365f8](https://github.com/deepkit/deepkit-framework/commit/14365f8ac3d8ee6a72b3a4790f084e74ecb1d53c))
- **mongo:** only log heartbeat error max 10 times ([064f964](https://github.com/deepkit/deepkit-framework/commit/064f964e9f87166d0b9c2b1d57e667f68f24a226))

## [1.0.8](https://github.com/deepkit/deepkit-framework/compare/v1.0.7...v1.0.8) (2025-05-20)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.7](https://github.com/deepkit/deepkit-framework/compare/v1.0.6...v1.0.7) (2025-04-18)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.5](https://github.com/deepkit/deepkit-framework/compare/v1.0.4...v1.0.5) (2025-04-02)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.3](https://github.com/deepkit/deepkit-framework/compare/v1.0.2...v1.0.3) (2025-03-13)

### Bug Fixes

- **mongo:** hello command ([30cbad5](https://github.com/deepkit/deepkit-framework/commit/30cbad5e745d9e3a60d212cb0814da3c2758753e))
- **mongo:** transactions ([e4781db](https://github.com/deepkit/deepkit-framework/commit/e4781db2a1f9766b811713f501b630adc384e6e7))

### Features

- **mongo,orm,logger:** improve transaction safety and logging ([95faf2c](https://github.com/deepkit/deepkit-framework/commit/95faf2c0143a34ba3524db290719692cc93593d3))
- **mongo:** add replica set support, rework connection handling ([7fe1a9a](https://github.com/deepkit/deepkit-framework/commit/7fe1a9aac6c799b33cdea7b1454464ebabc131d6))
- **mongo:** add support for read preference via Query API ([c829762](https://github.com/deepkit/deepkit-framework/commit/c829762ef6ec1f4b9a57c89d19f09dce39e5b940))
- **mongo:** more statistics, optimise error message when primary is not reachable ([0cd4e1e](https://github.com/deepkit/deepkit-framework/commit/0cd4e1eaf2127fb2ff7b4a729c3ef6eeb9f0d5fa))

## [1.0.2](https://github.com/deepkit/deepkit-framework/compare/v1.0.1...v1.0.2) (2025-02-24)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.160...v1.0.1) (2025-02-24)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.160](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.159...v1.0.1-alpha.160) (2025-02-18)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.159](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.158...v1.0.1-alpha.159) (2025-02-18)

### Bug Fixes

- **mongo:** update saslprep ([5413295](https://github.com/deepkit/deepkit-framework/commit/5413295aca72f3f75d672853d861aa662c43299b))

## [1.0.1-alpha.158](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.157...v1.0.1-alpha.158) (2025-02-15)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.157](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.156...v1.0.1-alpha.157) (2025-02-15)

### Bug Fixes

- tsconfig and tsc build ([ac71e83](https://github.com/deepkit/deepkit-framework/commit/ac71e838d542a3cab0e9b1cfc20b27637f1c01df))

### Features

- update to angular 19 and typescript 5.7.3, new @deepkit/angular-ssr package ([#627](https://github.com/deepkit/deepkit-framework/issues/627)) ([52333a7](https://github.com/deepkit/deepkit-framework/commit/52333a71f98c7e25a74f048dd57f1efba61098f5))

## [1.0.1-alpha.156](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.155...v1.0.1-alpha.156) (2025-01-30)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.155](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.154...v1.0.1-alpha.155) (2024-10-30)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.154](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.153...v1.0.1-alpha.154) (2024-09-06)

### Features

- **rpc:** make Buffer dependency optional ([2f32a12](https://github.com/deepkit/deepkit-framework/commit/2f32a1214c2c4555371fc1cfccdfdf533c21128e))

## [1.0.1-alpha.153](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.152...v1.0.1-alpha.153) (2024-06-06)

### Bug Fixes

- **orm:** correctly resolve reference class schemas ([e193325](https://github.com/deepkit/deepkit-framework/commit/e193325b561563f0207403103cd8caf859228cc2))

## [1.0.1-alpha.151](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.150...v1.0.1-alpha.151) (2024-05-14)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.150](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.149...v1.0.1-alpha.150) (2024-05-09)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.149](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.148...v1.0.1-alpha.149) (2024-05-07)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.148](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.147...v1.0.1-alpha.148) (2024-05-04)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.147](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.146...v1.0.1-alpha.147) (2024-05-04)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.146](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.145...v1.0.1-alpha.146) (2024-04-17)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.145](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.144...v1.0.1-alpha.145) (2024-04-08)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.144](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.143...v1.0.1-alpha.144) (2024-03-19)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.143](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.142...v1.0.1-alpha.143) (2024-03-17)

### Bug Fixes

- **core:** don't include stack in formatError per default ([1b603ee](https://github.com/deepkit/deepkit-framework/commit/1b603eef2938ab010fb6d83836894ad5a1c236af))

## [1.0.1-alpha.142](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.141...v1.0.1-alpha.142) (2024-03-06)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.141](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.140...v1.0.1-alpha.141) (2024-03-05)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.140](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.139...v1.0.1-alpha.140) (2024-03-02)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.139](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.138...v1.0.1-alpha.139) (2024-02-29)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.138](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.137...v1.0.1-alpha.138) (2024-02-27)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.137](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.136...v1.0.1-alpha.137) (2024-02-26)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.135](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.134...v1.0.1-alpha.135) (2024-02-16)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.134](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.133...v1.0.1-alpha.134) (2024-02-15)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.133](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.132...v1.0.1-alpha.133) (2024-02-15)

### Features

- **mongo:** add readPreference support ([6275c37](https://github.com/deepkit/deepkit-framework/commit/6275c377a557c5eda3d50b35f2b8ab5e868861dc))

## [1.0.1-alpha.132](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.131...v1.0.1-alpha.132) (2024-02-10)

### Features

- **mongo:** export custom command API ([d82ccd1](https://github.com/deepkit/deepkit-framework/commit/d82ccd19df86f84e8feacbe124e1d473ff481b8c))

## [1.0.1-alpha.131](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.130...v1.0.1-alpha.131) (2024-02-09)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.128](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.127...v1.0.1-alpha.128) (2024-02-06)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.127](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.126...v1.0.1-alpha.127) (2024-02-06)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.125](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.124...v1.0.1-alpha.125) (2024-02-05)

### Bug Fixes

- **mongo:** export error symbols ([5841a5a](https://github.com/deepkit/deepkit-framework/commit/5841a5a35927bf34d4187d047e43e2ec6317beb3))

## [1.0.1-alpha.124](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.123...v1.0.1-alpha.124) (2024-02-04)

### Features

- **orm:** better Error handling + UniqueConstraintFailure ([f1845ee](https://github.com/deepkit/deepkit-framework/commit/f1845ee84eb61a894155944a6efae6b926a4a47d))

## [1.0.1-alpha.123](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.122...v1.0.1-alpha.123) (2024-02-02)

### Features

- **orm:** onDatabaseError event ([cdb7256](https://github.com/deepkit/deepkit-framework/commit/cdb7256b34f1d9de16145dd79b307ccf45f7c72f))

## [1.0.1-alpha.122](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.121...v1.0.1-alpha.122) (2024-01-31)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.121](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.120...v1.0.1-alpha.121) (2024-01-31)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.120](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.119...v1.0.1-alpha.120) (2024-01-29)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.119](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.118...v1.0.1-alpha.119) (2024-01-28)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.118](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.117...v1.0.1-alpha.118) (2024-01-27)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.117](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.116...v1.0.1-alpha.117) (2024-01-26)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.116](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.115...v1.0.1-alpha.116) (2024-01-22)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.115](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.114...v1.0.1-alpha.115) (2024-01-21)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.114](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.113...v1.0.1-alpha.114) (2024-01-21)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.113](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.112...v1.0.1-alpha.113) (2024-01-17)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.112](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.111...v1.0.1-alpha.112) (2024-01-16)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.111](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.110...v1.0.1-alpha.111) (2024-01-15)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.110](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.109...v1.0.1-alpha.110) (2024-01-11)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.109](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.108...v1.0.1-alpha.109) (2024-01-10)

### Features

- **mongo,sql:** skip database field for inserts ([#527](https://github.com/deepkit/deepkit-framework/issues/527)) ([9fca388](https://github.com/deepkit/deepkit-framework/commit/9fca388be5efa03727a4f7e9b485dce572a66a51))

## [1.0.1-alpha.108](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.107...v1.0.1-alpha.108) (2023-11-21)

**Note:** Version bump only for package @deepkit/mongo

## [1.0.1-alpha.105](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.103...v1.0.1-alpha.105) (2023-10-23)

### Bug Fixes

- **mongo:** also check connection request for queued requests. ([6c6ca94](https://github.com/deepkit/deepkit-framework/commit/6c6ca94571775897edc62cd8dfa0d407b9695a98))
- **mongo:** fix off by one error in pool ([666ba86](https://github.com/deepkit/deepkit-framework/commit/666ba8614054db7deaf61fed195538e25fcee516))
