# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.1.0](https://github.com/deepkit/deepkit-framework/compare/v1.0.19...v1.1.0) (2026-10-31)

### Bug Fixes

- **core,filesystem:** handle Windows paths in getCurrentDirName and the local adapter ([#688](https://github.com/deepkit/deepkit-framework/issues/688), [#694](https://github.com/deepkit/deepkit-framework/issues/694)) ([75816ef](https://github.com/deepkit/deepkit-framework/commit/75816effbee603e2d32aaa15137fbe12525b0fe8))
- **deps:** `@deepkit/*` peer dependencies require the current version ([#574](https://github.com/deepkit/deepkit-framework/issues/574)) ([ee7546f](https://github.com/deepkit/deepkit-framework/commit/ee7546f4416b66546e146591a45d39094f49c1c6))
- **deps:** commit dist/esm/package.json of all packages with an ESM build ([9dbdfcc](https://github.com/deepkit/deepkit-framework/commit/9dbdfcc62f498d095d4f16cfb653124488796557))

### Features

- enable isolatedModules ([#683](https://github.com/deepkit/deepkit-framework/issues/683)) ([c730cfc](https://github.com/deepkit/deepkit-framework/commit/c730cfcfadc898f632b3c64b90ca57fa6764af32))

### BREAKING CHANGES

- const enums converted to regular enums in:
  - MappedModifier (type-spec)
  - BinaryBigIntType (type)
  - BrokerType (broker)
  - RpcMessageRouteType (rpc)
  - AuthMechanism (mongo)

## [1.0.19](https://github.com/deepkit/deepkit-framework/compare/v1.0.17...v1.0.19) (2025-09-22)

**Note:** Version bump only for package @deepkit/filesystem

## [1.0.18](https://github.com/deepkit/deepkit-framework/compare/v1.0.17...v1.0.18) (2025-09-22)

**Note:** Version bump only for package @deepkit/filesystem

## [1.0.15](https://github.com/deepkit/deepkit-framework/compare/v1.0.14...v1.0.15) (2025-06-26)

### Features

- **desktop-ui:** refactor to standalone/signal, update angular to v20, new website docs ([#657](https://github.com/deepkit/deepkit-framework/issues/657)) ([a39d26c](https://github.com/deepkit/deepkit-framework/commit/a39d26cd527947cb93c113434f1a29f4cc014d22))

## [1.0.5](https://github.com/deepkit/deepkit-framework/compare/v1.0.4...v1.0.5) (2025-04-02)

### Bug Fixes

- **filesystem:** ensure readLocalFile reads from local FS ([ad948e6](https://github.com/deepkit/deepkit-framework/commit/ad948e63d2f513fe52816baed3f1d48e3c2a8ac1)), closes [#637](https://github.com/deepkit/deepkit-framework/issues/637)
- **filesystem:** ensure writeFile forwards visibility ([57250a2](https://github.com/deepkit/deepkit-framework/commit/57250a20dc4051bad93b32830dc2f4015dcc6826)), closes [#638](https://github.com/deepkit/deepkit-framework/issues/638)

## [1.0.3](https://github.com/deepkit/deepkit-framework/compare/v1.0.2...v1.0.3) (2025-03-13)

**Note:** Version bump only for package @deepkit/filesystem

## [1.0.1](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.160...v1.0.1) (2025-02-24)

**Note:** Version bump only for package @deepkit/filesystem

## [1.0.1-alpha.158](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.157...v1.0.1-alpha.158) (2025-02-15)

**Note:** Version bump only for package @deepkit/filesystem

## [1.0.1-alpha.157](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.156...v1.0.1-alpha.157) (2025-02-15)

### Features

- update to angular 19 and typescript 5.7.3, new @deepkit/angular-ssr package ([#627](https://github.com/deepkit/deepkit-framework/issues/627)) ([52333a7](https://github.com/deepkit/deepkit-framework/commit/52333a71f98c7e25a74f048dd57f1efba61098f5))

## [1.0.1-alpha.156](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.155...v1.0.1-alpha.156) (2025-01-30)

**Note:** Version bump only for package @deepkit/filesystem

## [1.0.1-alpha.154](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.153...v1.0.1-alpha.154) (2024-09-06)

**Note:** Version bump only for package @deepkit/filesystem

## [1.0.1-alpha.147](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.146...v1.0.1-alpha.147) (2024-05-04)

**Note:** Version bump only for package @deepkit/filesystem

## [1.0.1-alpha.145](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.144...v1.0.1-alpha.145) (2024-04-08)

**Note:** Version bump only for package @deepkit/filesystem

## [1.0.1-alpha.143](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.142...v1.0.1-alpha.143) (2024-03-17)

**Note:** Version bump only for package @deepkit/filesystem

## [1.0.1-alpha.124](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.123...v1.0.1-alpha.124) (2024-02-04)

### Features

- **orm:** better Error handling + UniqueConstraintFailure ([f1845ee](https://github.com/deepkit/deepkit-framework/commit/f1845ee84eb61a894155944a6efae6b926a4a47d))

## [1.0.1-alpha.123](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.122...v1.0.1-alpha.123) (2024-02-02)

**Note:** Version bump only for package @deepkit/filesystem

## [1.0.1-alpha.121](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.120...v1.0.1-alpha.121) (2024-01-31)

**Note:** Version bump only for package @deepkit/filesystem

## [1.0.1-alpha.114](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.113...v1.0.1-alpha.114) (2024-01-21)

**Note:** Version bump only for package @deepkit/filesystem

## [1.0.1-alpha.113](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.112...v1.0.1-alpha.113) (2024-01-17)

**Note:** Version bump only for package @deepkit/filesystem

## [1.0.1-alpha.112](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.111...v1.0.1-alpha.112) (2024-01-16)

**Note:** Version bump only for package @deepkit/filesystem

## [1.0.1-alpha.108](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.107...v1.0.1-alpha.108) (2023-11-21)

**Note:** Version bump only for package @deepkit/filesystem

## [1.0.1-alpha.105](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.103...v1.0.1-alpha.105) (2023-10-23)

**Note:** Version bump only for package @deepkit/filesystem
