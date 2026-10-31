# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.1.0](https://github.com/deepkit/deepkit-framework/compare/v1.0.19...v1.1.0) (2026-10-31)

### Bug Fixes

- **deps:** `@deepkit/*` peer dependencies require the current version ([#574](https://github.com/deepkit/deepkit-framework/issues/574)) ([ee7546f](https://github.com/deepkit/deepkit-framework/commit/ee7546f4416b66546e146591a45d39094f49c1c6))
- **deps:** commit dist/esm/package.json of all packages with an ESM build ([9dbdfcc](https://github.com/deepkit/deepkit-framework/commit/9dbdfcc62f498d095d4f16cfb653124488796557))
- **deps:** declare all @deepkit/\* packages that are imported ([ba76daa](https://github.com/deepkit/deepkit-framework/commit/ba76daacc071e489994a83d8a8aecefbec25d67b))

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

**Note:** Version bump only for package @deepkit/angular-ssr

## [1.0.18](https://github.com/deepkit/deepkit-framework/compare/v1.0.17...v1.0.18) (2025-09-22)

**Note:** Version bump only for package @deepkit/angular-ssr

## [1.0.15](https://github.com/deepkit/deepkit-framework/compare/v1.0.14...v1.0.15) (2025-06-26)

### Features

- **desktop-ui:** refactor to standalone/signal, update angular to v20, new website docs ([#657](https://github.com/deepkit/deepkit-framework/issues/657)) ([a39d26c](https://github.com/deepkit/deepkit-framework/commit/a39d26cd527947cb93c113434f1a29f4cc014d22))

## [1.0.12](https://github.com/deepkit/deepkit-framework/compare/v1.0.11...v1.0.12) (2025-06-05)

**Note:** Version bump only for package @deepkit/angular-ssr

## [1.0.11](https://github.com/deepkit/deepkit-framework/compare/v1.0.10...v1.0.11) (2025-06-02)

**Note:** Version bump only for package @deepkit/angular-ssr

## [1.0.9](https://github.com/deepkit/deepkit-framework/compare/v1.0.8...v1.0.9) (2025-05-23)

**Note:** Version bump only for package @deepkit/angular-ssr

## [1.0.8](https://github.com/deepkit/deepkit-framework/compare/v1.0.7...v1.0.8) (2025-05-20)

**Note:** Version bump only for package @deepkit/angular-ssr

## [1.0.5](https://github.com/deepkit/deepkit-framework/compare/v1.0.4...v1.0.5) (2025-04-02)

**Note:** Version bump only for package @deepkit/angular-ssr

## [1.0.3](https://github.com/deepkit/deepkit-framework/compare/v1.0.2...v1.0.3) (2025-03-13)

**Note:** Version bump only for package @deepkit/angular-ssr

## [1.0.2](https://github.com/deepkit/deepkit-framework/compare/v1.0.1...v1.0.2) (2025-02-24)

### Features

- **angular-ssr:** support server:start serving of angular routes ([ee3972c](https://github.com/deepkit/deepkit-framework/commit/ee3972cb07766299e315d885a1ee82ca6a49dda9))

## [1.0.1](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.160...v1.0.1) (2025-02-24)

**Note:** Version bump only for package @deepkit/angular-ssr

## [1.0.1-alpha.160](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.159...v1.0.1-alpha.160) (2025-02-18)

### Bug Fixes

- **angular-ssr:** remove usage of angular internals ([ae91295](https://github.com/deepkit/deepkit-framework/commit/ae91295e7da71b6f4c1e7672bcc5983b267f8ee7))

## [1.0.1-alpha.158](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.157...v1.0.1-alpha.158) (2025-02-15)

**Note:** Version bump only for package @deepkit/angular-ssr

## [1.0.1-alpha.157](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.156...v1.0.1-alpha.157) (2025-02-15)

### Bug Fixes

- **angular-ssr:** docs ([eae7291](https://github.com/deepkit/deepkit-framework/commit/eae729141372fc83492a9b66d479eb121eec7a0f))
- tsconfig and tsc build ([ac71e83](https://github.com/deepkit/deepkit-framework/commit/ac71e838d542a3cab0e9b1cfc20b27637f1c01df))

### Features

- update to angular 19 and typescript 5.7.3, new @deepkit/angular-ssr package ([#627](https://github.com/deepkit/deepkit-framework/issues/627)) ([52333a7](https://github.com/deepkit/deepkit-framework/commit/52333a71f98c7e25a74f048dd57f1efba61098f5))
