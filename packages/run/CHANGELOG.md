# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.1.0](https://github.com/deepkit/deepkit-framework/compare/v1.0.19...v1.1.0) (2026-10-31)

### Bug Fixes

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

**Note:** Version bump only for package @deepkit/run

## [1.0.18](https://github.com/deepkit/deepkit-framework/compare/v1.0.17...v1.0.18) (2025-09-22)

**Note:** Version bump only for package @deepkit/run

## [1.0.15](https://github.com/deepkit/deepkit-framework/compare/v1.0.14...v1.0.15) (2025-06-26)

### Features

- **desktop-ui:** refactor to standalone/signal, update angular to v20, new website docs ([#657](https://github.com/deepkit/deepkit-framework/issues/657)) ([a39d26c](https://github.com/deepkit/deepkit-framework/commit/a39d26cd527947cb93c113434f1a29f4cc014d22))

## [1.0.5](https://github.com/deepkit/deepkit-framework/compare/v1.0.4...v1.0.5) (2025-04-02)

### Features

- **run:** new @deepkit/run package to run typescript easily ([0b9246e](https://github.com/deepkit/deepkit-framework/commit/0b9246edaab9deb80b6855cba90f48baa4562e08))
