# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.1.0](https://github.com/deepkit/deepkit-framework/compare/v1.0.19...v1.1.0) (2026-10-31)

### Bug Fixes

- **core,filesystem:** handle Windows paths in getCurrentDirName and the local adapter ([#688](https://github.com/deepkit/deepkit-framework/issues/688), [#694](https://github.com/deepkit/deepkit-framework/issues/694)) ([75816ef](https://github.com/deepkit/deepkit-framework/commit/75816effbee603e2d32aaa15137fbe12525b0fe8))
- **deps:** `@deepkit/*` peer dependencies require the current version ([#574](https://github.com/deepkit/deepkit-framework/issues/574)) ([ee7546f](https://github.com/deepkit/deepkit-framework/commit/ee7546f4416b66546e146591a45d39094f49c1c6))
- **deps:** commit dist/esm/package.json of all packages with an ESM build ([9dbdfcc](https://github.com/deepkit/deepkit-framework/commit/9dbdfcc62f498d095d4f16cfb653124488796557))
- **deps:** declare all @deepkit/\* packages that are imported ([ba76daa](https://github.com/deepkit/deepkit-framework/commit/ba76daacc071e489994a83d8a8aecefbec25d67b))
- **template,mongo,http,framework:** make the ESM builds loadable ([814ca04](https://github.com/deepkit/deepkit-framework/commit/814ca04b36765b7c62b79c787e84b86582ebca63))

### Features

- **bench:** benchmarks for all core packages, comparisons and a runner that tracks results ([b5abf6f](https://github.com/deepkit/deepkit-framework/commit/b5abf6f7139b7c31dd4997b7a1d084a1348c8136))
- enable isolatedModules ([#683](https://github.com/deepkit/deepkit-framework/issues/683)) ([c730cfc](https://github.com/deepkit/deepkit-framework/commit/c730cfcfadc898f632b3c64b90ca57fa6764af32))

### Performance Improvements

- **type,type-compiler,core:** faster type guards, type arguments and serializer calls ([c39c8fd](https://github.com/deepkit/deepkit-framework/commit/c39c8fd8838fa205400507ba0146918333186044)), closes [#568](https://github.com/deepkit/deepkit-framework/issues/568)
- **type:** check plain objects in the generated type guard, not in isObjectLiteral ([b7012e2](https://github.com/deepkit/deepkit-framework/commit/b7012e2589f942395a2ddad8006e0edf4855a33c))

### BREAKING CHANGES

- const enums converted to regular enums in:
  - MappedModifier (type-spec)
  - BinaryBigIntType (type)
  - BrokerType (broker)
  - RpcMessageRouteType (rpc)
  - AuthMechanism (mongo)

## [1.0.19](https://github.com/deepkit/deepkit-framework/compare/v1.0.17...v1.0.19) (2025-09-22)

### Features

- **website:** add translations (chinese, korean, japanese, german) ([4ab7058](https://github.com/deepkit/deepkit-framework/commit/4ab7058edd72a376f856c617a7f8ee243c82cd8b))

## [1.0.18](https://github.com/deepkit/deepkit-framework/compare/v1.0.17...v1.0.18) (2025-09-22)

### Features

- **website:** add translations (chinese, korean, japanese, german) ([4ab7058](https://github.com/deepkit/deepkit-framework/commit/4ab7058edd72a376f856c617a7f8ee243c82cd8b))

## [1.0.15](https://github.com/deepkit/deepkit-framework/compare/v1.0.14...v1.0.15) (2025-06-26)

### Features

- **desktop-ui:** refactor to standalone/signal, update angular to v20, new website docs ([#657](https://github.com/deepkit/deepkit-framework/issues/657)) ([a39d26c](https://github.com/deepkit/deepkit-framework/commit/a39d26cd527947cb93c113434f1a29f4cc014d22))

## [1.0.5](https://github.com/deepkit/deepkit-framework/compare/v1.0.4...v1.0.5) (2025-04-02)

### Features

- **core:** export AsyncFunction ([cebd164](https://github.com/deepkit/deepkit-framework/commit/cebd164671543e106dee4459e2741dfe12f00020))

## [1.0.3](https://github.com/deepkit/deepkit-framework/compare/v1.0.2...v1.0.3) (2025-03-13)

### Features

- **mongo,orm,logger:** improve transaction safety and logging ([95faf2c](https://github.com/deepkit/deepkit-framework/commit/95faf2c0143a34ba3524db290719692cc93593d3))
- **rpc:** automatically garbage collect observables + new event system + stats collection ([d727232](https://github.com/deepkit/deepkit-framework/commit/d727232ca4b445a6bc82de8df31e25ba2d60d683))

## [1.0.1](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.160...v1.0.1) (2025-02-24)

**Note:** Version bump only for package @deepkit/core

## [1.0.1-alpha.158](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.157...v1.0.1-alpha.158) (2025-02-15)

**Note:** Version bump only for package @deepkit/core

## [1.0.1-alpha.157](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.156...v1.0.1-alpha.157) (2025-02-15)

### Bug Fixes

- **core:** disable reflection in indent.ts ([9bbc278](https://github.com/deepkit/deepkit-framework/commit/9bbc2780b904996f51f6ab97ac87566e86f02ddc))
- **core:** pass correct global in indent.ts ([b1558e4](https://github.com/deepkit/deepkit-framework/commit/b1558e455271f7d6e282ff0668665da4eb8f4920))
- **rpc:** ensure message size is reset to 0 after reaching a buffer that is too small ([c78a2a2](https://github.com/deepkit/deepkit-framework/commit/c78a2a26b98384ae6d1e6b87aa993e77026f4e7c))
- tsconfig and tsc build ([ac71e83](https://github.com/deepkit/deepkit-framework/commit/ac71e838d542a3cab0e9b1cfc20b27637f1c01df))
- **type:** convert TypeAnnotation into intrinsic type ([#629](https://github.com/deepkit/deepkit-framework/issues/629)) ([4d1a13e](https://github.com/deepkit/deepkit-framework/commit/4d1a13ec11536e1951f5e348bd0b43b2244cccca)), closes [#626](https://github.com/deepkit/deepkit-framework/issues/626)

### Features

- update to angular 19 and typescript 5.7.3, new @deepkit/angular-ssr package ([#627](https://github.com/deepkit/deepkit-framework/issues/627)) ([52333a7](https://github.com/deepkit/deepkit-framework/commit/52333a71f98c7e25a74f048dd57f1efba61098f5))

## [1.0.1-alpha.156](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.155...v1.0.1-alpha.156) (2025-01-30)

### Bug Fixes

- **type:** make sure forwarded type arguments reset Ω at the origin ([3138671](https://github.com/deepkit/deepkit-framework/commit/31386718f3fc634983c0eedd652105765e3e6a75)), closes [#619](https://github.com/deepkit/deepkit-framework/issues/619)

## [1.0.1-alpha.154](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.153...v1.0.1-alpha.154) (2024-09-06)

### Features

- **rpc:** make Buffer dependency optional ([2f32a12](https://github.com/deepkit/deepkit-framework/commit/2f32a1214c2c4555371fc1cfccdfdf533c21128e))

## [1.0.1-alpha.147](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.146...v1.0.1-alpha.147) (2024-05-04)

### Bug Fixes

- **type:** make sure handled constructor properties are not set twice ([2e82eb6](https://github.com/deepkit/deepkit-framework/commit/2e82eb6fe6bb8b519b8f170334740ee9f7f988be))
- **type:** resolve global classes as shallow TypeClass ([d976024](https://github.com/deepkit/deepkit-framework/commit/d97602409b1e8c1d63839e2d1b75d16a0ccd4cfd))

## [1.0.1-alpha.145](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.144...v1.0.1-alpha.145) (2024-04-08)

### Bug Fixes

- type guard handing of empty Map/Set ([da4cf82](https://github.com/deepkit/deepkit-framework/commit/da4cf8242a317157f8b02c67d2b5754fb8f29381))

## [1.0.1-alpha.143](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.142...v1.0.1-alpha.143) (2024-03-17)

### Bug Fixes

- **core:** don't include stack in formatError per default ([1b603ee](https://github.com/deepkit/deepkit-framework/commit/1b603eef2938ab010fb6d83836894ad5a1c236af))
- **type:** print Error cause chain in formatError ([c2a413a](https://github.com/deepkit/deepkit-framework/commit/c2a413aeb74155ddb29f1939b48e034f05d9ae60))

## [1.0.1-alpha.124](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.123...v1.0.1-alpha.124) (2024-02-04)

### Bug Fixes

- **desktop-ui:** -webkit-scrollbar is not supported in chrome anymore ([68fca4f](https://github.com/deepkit/deepkit-framework/commit/68fca4f393d170e2ce5b4bfa17539d06d6ab1cb0))
- **type:** handle more circular types ([5f6bd12](https://github.com/deepkit/deepkit-framework/commit/5f6bd124aaf9c546014b81dbded8110312f4e819)), closes [#477](https://github.com/deepkit/deepkit-framework/issues/477)

### Features

- **orm:** better Error handling + UniqueConstraintFailure ([f1845ee](https://github.com/deepkit/deepkit-framework/commit/f1845ee84eb61a894155944a6efae6b926a4a47d))

## [1.0.1-alpha.123](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.122...v1.0.1-alpha.123) (2024-02-02)

### Features

- **orm:** onDatabaseError event ([cdb7256](https://github.com/deepkit/deepkit-framework/commit/cdb7256b34f1d9de16145dd79b307ccf45f7c72f))

## [1.0.1-alpha.121](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.120...v1.0.1-alpha.121) (2024-01-31)

### Bug Fixes

- **core:** clear timeouts correctly in ProcessLock ([89cd2d5](https://github.com/deepkit/deepkit-framework/commit/89cd2d5631e09555562a2a25d1c098f70406a469))

## [1.0.1-alpha.114](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.113...v1.0.1-alpha.114) (2024-01-21)

**Note:** Version bump only for package @deepkit/core

## [1.0.1-alpha.113](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.112...v1.0.1-alpha.113) (2024-01-17)

### Features

- **orm:** remove rxjs dependency ([0d9dfe1](https://github.com/deepkit/deepkit-framework/commit/0d9dfe1f80bfc34bfa12a4ffaa2fd203865d942b))

## [1.0.1-alpha.112](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.111...v1.0.1-alpha.112) (2024-01-16)

### Features

- **app:** improve CLI outputs/parsing by removing [@oclif](https://github.com/oclif) ([e38bbd1](https://github.com/deepkit/deepkit-framework/commit/e38bbd143daa2c856c57eca07a4fd29e884fe97e))

## [1.0.1-alpha.108](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.107...v1.0.1-alpha.108) (2023-11-21)

### Bug Fixes

- **core:** make sure stringifyValueWithType does not print unlimited depth ([56fbef9](https://github.com/deepkit/deepkit-framework/commit/56fbef908eb5e0c4d4c244123637182bb94f7145))

## [1.0.1-alpha.105](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.103...v1.0.1-alpha.105) (2023-10-23)

**Note:** Version bump only for package @deepkit/core
