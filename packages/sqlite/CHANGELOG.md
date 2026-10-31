# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.1.0](https://github.com/deepkit/deepkit-framework/compare/v1.0.19...v1.1.0) (2026-10-31)

### Bug Fixes

- **deps:** `@deepkit/*` peer dependencies require the current version ([#574](https://github.com/deepkit/deepkit-framework/issues/574)) ([ee7546f](https://github.com/deepkit/deepkit-framework/commit/ee7546f4416b66546e146591a45d39094f49c1c6))
- **deps:** declare all @deepkit/\* packages that are imported ([ba76daa](https://github.com/deepkit/deepkit-framework/commit/ba76daacc071e489994a83d8a8aecefbec25d67b))
- **orm:** joined back references of a reference upgraded to a full entity ([61ede01](https://github.com/deepkit/deepkit-framework/commit/61ede01c6b3dbc3bb6d6212a81ddfd99568168b8)), closes [#636](https://github.com/deepkit/deepkit-framework/issues/636)
- **sql,postgres,sqlite:** parse column defaults instead of eval() ([f0661ec](https://github.com/deepkit/deepkit-framework/commit/f0661ec7121fb4a0c0b58341cb20eb8ba9eaeb68))
- **sql:** bring back --path for the standalone migration commands ([849ef19](https://github.com/deepkit/deepkit-framework/commit/849ef19a95b0612668a1b4a43e5e9f0dfdbe07b9)), closes [#613](https://github.com/deepkit/deepkit-framework/issues/613)
- **sqlite:** update better-sqlite3 to 12.11 for Node.js 26 support ([e6ad1fb](https://github.com/deepkit/deepkit-framework/commit/e6ad1fbe5f17483e79259f6a8953743e0d57ae43))
- **sqlite:** validate maxConnections of the connection pool ([dab7244](https://github.com/deepkit/deepkit-framework/commit/dab7244288100b83bf94f140afed295034b59343)), closes [#393](https://github.com/deepkit/deepkit-framework/issues/393)
- **type,orm,mongo,http,framework:** overridden references, optional Embedded, Mongo dot paths ([#704](https://github.com/deepkit/deepkit-framework/issues/704), [#254](https://github.com/deepkit/deepkit-framework/issues/254), [#697](https://github.com/deepkit/deepkit-framework/issues/697)) ([4a8a7a4](https://github.com/deepkit/deepkit-framework/commit/4a8a7a4b859024047dc86e5c9c941c17ae992bc9)), closes [#439](https://github.com/deepkit/deepkit-framework/issues/439) [#591](https://github.com/deepkit/deepkit-framework/issues/591) [#346](https://github.com/deepkit/deepkit-framework/issues/346) [#430](https://github.com/deepkit/deepkit-framework/issues/430) [#444](https://github.com/deepkit/deepkit-framework/issues/444) [#375](https://github.com/deepkit/deepkit-framework/issues/375)

### Features

- **bench:** benchmarks for all core packages, comparisons and a runner that tracks results ([b5abf6f](https://github.com/deepkit/deepkit-framework/commit/b5abf6f7139b7c31dd4997b7a1d084a1348c8136))
- enable isolatedModules ([#683](https://github.com/deepkit/deepkit-framework/issues/683)) ([c730cfc](https://github.com/deepkit/deepkit-framework/commit/c730cfcfadc898f632b3c64b90ca57fa6764af32))

### BREAKING CHANGES

- const enums converted to regular enums in:
  - MappedModifier (type-spec)
  - BinaryBigIntType (type)
  - BrokerType (broker)
  - RpcMessageRouteType (rpc)
  - AuthMechanism (mongo)

## [1.0.19](https://github.com/deepkit/deepkit-framework/compare/v1.0.17...v1.0.19) (2025-09-22)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.18](https://github.com/deepkit/deepkit-framework/compare/v1.0.17...v1.0.18) (2025-09-22)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.15](https://github.com/deepkit/deepkit-framework/compare/v1.0.14...v1.0.15) (2025-06-26)

### Features

- **desktop-ui:** refactor to standalone/signal, update angular to v20, new website docs ([#657](https://github.com/deepkit/deepkit-framework/issues/657)) ([a39d26c](https://github.com/deepkit/deepkit-framework/commit/a39d26cd527947cb93c113434f1a29f4cc014d22))

## [1.0.14](https://github.com/deepkit/deepkit-framework/compare/v1.0.13...v1.0.14) (2025-06-22)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.12](https://github.com/deepkit/deepkit-framework/compare/v1.0.11...v1.0.12) (2025-06-05)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.11](https://github.com/deepkit/deepkit-framework/compare/v1.0.10...v1.0.11) (2025-06-02)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.9](https://github.com/deepkit/deepkit-framework/compare/v1.0.8...v1.0.9) (2025-05-23)

### Bug Fixes

- **sqlite:** ensure logger is passed to adapter and first connection ([cf77b0f](https://github.com/deepkit/deepkit-framework/commit/cf77b0f6e906792f28dba5adc53167fdb33e410b))

## [1.0.8](https://github.com/deepkit/deepkit-framework/compare/v1.0.7...v1.0.8) (2025-05-20)

### Features

- **sql:** support custom database field name filtering ([#650](https://github.com/deepkit/deepkit-framework/issues/650)) ([453f347](https://github.com/deepkit/deepkit-framework/commit/453f34712d41f575ae068382765232f769b24a9d))

## [1.0.5](https://github.com/deepkit/deepkit-framework/compare/v1.0.4...v1.0.5) (2025-04-02)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.3](https://github.com/deepkit/deepkit-framework/compare/v1.0.2...v1.0.3) (2025-03-13)

### Features

- **mongo,orm,logger:** improve transaction safety and logging ([95faf2c](https://github.com/deepkit/deepkit-framework/commit/95faf2c0143a34ba3524db290719692cc93593d3))

## [1.0.2](https://github.com/deepkit/deepkit-framework/compare/v1.0.1...v1.0.2) (2025-02-24)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.160...v1.0.1) (2025-02-24)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.160](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.159...v1.0.1-alpha.160) (2025-02-18)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.158](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.157...v1.0.1-alpha.158) (2025-02-15)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.157](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.156...v1.0.1-alpha.157) (2025-02-15)

### Bug Fixes

- tsconfig and tsc build ([ac71e83](https://github.com/deepkit/deepkit-framework/commit/ac71e838d542a3cab0e9b1cfc20b27637f1c01df))

### Features

- **sqlite:** update better-sqlite3 to 11.8.1 ([cb1eafd](https://github.com/deepkit/deepkit-framework/commit/cb1eafd48306bd6c656b392adc865d48dd425a02))

## [1.0.1-alpha.156](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.155...v1.0.1-alpha.156) (2025-01-30)

### Bug Fixes

- **type:** make sure forwarded type arguments reset Ω at the origin ([3138671](https://github.com/deepkit/deepkit-framework/commit/31386718f3fc634983c0eedd652105765e3e6a75)), closes [#619](https://github.com/deepkit/deepkit-framework/issues/619)

## [1.0.1-alpha.155](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.154...v1.0.1-alpha.155) (2024-10-30)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.154](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.153...v1.0.1-alpha.154) (2024-09-06)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.153](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.152...v1.0.1-alpha.153) (2024-06-06)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.151](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.150...v1.0.1-alpha.151) (2024-05-14)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.150](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.149...v1.0.1-alpha.150) (2024-05-09)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.149](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.148...v1.0.1-alpha.149) (2024-05-07)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.148](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.147...v1.0.1-alpha.148) (2024-05-04)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.147](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.146...v1.0.1-alpha.147) (2024-05-04)

### Bug Fixes

- **sqlite:** make sure ALTER TABLE are not aggregated ([74ef2eb](https://github.com/deepkit/deepkit-framework/commit/74ef2eb340924306dcd59b4d913d0eb32f88757f))

## [1.0.1-alpha.146](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.145...v1.0.1-alpha.146) (2024-04-17)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.145](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.144...v1.0.1-alpha.145) (2024-04-08)

### Bug Fixes

- **sql:** resolve `Date|null` to date type ([ab12802](https://github.com/deepkit/deepkit-framework/commit/ab12802c307d9dcf17925526dd5dcf87c87e8899))

## [1.0.1-alpha.144](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.143...v1.0.1-alpha.144) (2024-03-19)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.143](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.142...v1.0.1-alpha.143) (2024-03-17)

### Features

- **mysql, postgres:** add support for connection URLs ([2518670](https://github.com/deepkit/deepkit-framework/commit/25186701e3d6ea60ea232cbcc0c989e195df9edf))

## [1.0.1-alpha.142](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.141...v1.0.1-alpha.142) (2024-03-06)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.141](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.140...v1.0.1-alpha.141) (2024-03-05)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.140](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.139...v1.0.1-alpha.140) (2024-03-02)

### Features

- **sql:** support per-field name remapping ([63b8aaf](https://github.com/deepkit/deepkit-framework/commit/63b8aaface420a98f14511b22efaffc9628be41d))

## [1.0.1-alpha.139](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.138...v1.0.1-alpha.139) (2024-02-29)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.138](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.137...v1.0.1-alpha.138) (2024-02-27)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.137](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.136...v1.0.1-alpha.137) (2024-02-26)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.134](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.133...v1.0.1-alpha.134) (2024-02-15)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.133](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.132...v1.0.1-alpha.133) (2024-02-15)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.132](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.131...v1.0.1-alpha.132) (2024-02-10)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.131](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.130...v1.0.1-alpha.131) (2024-02-09)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.128](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.127...v1.0.1-alpha.128) (2024-02-06)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.127](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.126...v1.0.1-alpha.127) (2024-02-06)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.124](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.123...v1.0.1-alpha.124) (2024-02-04)

### Features

- **orm:** better Error handling + UniqueConstraintFailure ([f1845ee](https://github.com/deepkit/deepkit-framework/commit/f1845ee84eb61a894155944a6efae6b926a4a47d))
- **orm:** new API to configure a join query ([64cc55e](https://github.com/deepkit/deepkit-framework/commit/64cc55e812a6be555515e036de4e6b18d147b4f0))

## [1.0.1-alpha.123](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.122...v1.0.1-alpha.123) (2024-02-02)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.122](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.121...v1.0.1-alpha.122) (2024-01-31)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.121](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.120...v1.0.1-alpha.121) (2024-01-31)

### Bug Fixes

- **sqlite:** correctly quote column renaming ([e555ac8](https://github.com/deepkit/deepkit-framework/commit/e555ac8992e9f4ebbbf49f4c88f5e9df05954eef))

## [1.0.1-alpha.120](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.119...v1.0.1-alpha.120) (2024-01-29)

### Features

- **sql:** support more union types and add new performance abstraction ([03067fa](https://github.com/deepkit/deepkit-framework/commit/03067fae3490603e1cb5ee28abd95521caeea24b)), closes [#525](https://github.com/deepkit/deepkit-framework/issues/525)

## [1.0.1-alpha.119](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.118...v1.0.1-alpha.119) (2024-01-28)

### Features

- **sql:** support embedded union object literals ([29da45c](https://github.com/deepkit/deepkit-framework/commit/29da45cd45c809d7b0ce029392c20d30b8260a9f))

## [1.0.1-alpha.118](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.117...v1.0.1-alpha.118) (2024-01-27)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.117](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.116...v1.0.1-alpha.117) (2024-01-26)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.116](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.115...v1.0.1-alpha.116) (2024-01-22)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.115](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.114...v1.0.1-alpha.115) (2024-01-21)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.114](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.113...v1.0.1-alpha.114) (2024-01-21)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.113](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.112...v1.0.1-alpha.113) (2024-01-17)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.112](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.111...v1.0.1-alpha.112) (2024-01-16)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.111](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.110...v1.0.1-alpha.111) (2024-01-15)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.110](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.109...v1.0.1-alpha.110) (2024-01-11)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.109](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.108...v1.0.1-alpha.109) (2024-01-10)

**Note:** Version bump only for package @deepkit/sqlite

## [1.0.1-alpha.108](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.107...v1.0.1-alpha.108) (2023-11-21)

### Bug Fixes

- **type:** make sure `typeof x` expression doesn't return the original type ([7206e7e](https://github.com/deepkit/deepkit-framework/commit/7206e7ef9c3728e2b60d9a6cd7ecdb167fca78d0))

## [1.0.1-alpha.105](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.103...v1.0.1-alpha.105) (2023-10-23)

**Note:** Version bump only for package @deepkit/sqlite
