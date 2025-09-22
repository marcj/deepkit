# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.0.19](https://github.com/deepkit/deepkit-framework/compare/v1.0.17...v1.0.19) (2025-09-22)

**Note:** Version bump only for package @deepkit/bson

## [1.0.18](https://github.com/deepkit/deepkit-framework/compare/v1.0.17...v1.0.18) (2025-09-22)

**Note:** Version bump only for package @deepkit/bson

## [1.0.15](https://github.com/deepkit/deepkit-framework/compare/v1.0.14...v1.0.15) (2025-06-26)

### Features

- **desktop-ui:** refactor to standalone/signal, update angular to v20, new website docs ([#657](https://github.com/deepkit/deepkit-framework/issues/657)) ([a39d26c](https://github.com/deepkit/deepkit-framework/commit/a39d26cd527947cb93c113434f1a29f4cc014d22))

## [1.0.12](https://github.com/deepkit/deepkit-framework/compare/v1.0.11...v1.0.12) (2025-06-05)

### Bug Fixes

- **bson:** ensure to seek over invalid elements in parser element lookup ([378a922](https://github.com/deepkit/deepkit-framework/commit/378a922c12cebdc93944a527892c33c79538f064))

## [1.0.11](https://github.com/deepkit/deepkit-framework/compare/v1.0.10...v1.0.11) (2025-06-02)

### Features

- **bson:** support deserialization of OID and all number types to string as fallback union member matcher ([83020c2](https://github.com/deepkit/deepkit-framework/commit/83020c24dd89a711f5719175692f122f8f8308c6))

## [1.0.9](https://github.com/deepkit/deepkit-framework/compare/v1.0.8...v1.0.9) (2025-05-23)

### Bug Fixes

- **bson:** rename type to BsonEncoder ([815f9a0](https://github.com/deepkit/deepkit-framework/commit/815f9a0f7f058455cddc2fe16cb4fa999ec56585))

### Features

- **bson:** add TypeEncoder to encode all BSON types (not only container types) to BSON ([3f2aaf9](https://github.com/deepkit/deepkit-framework/commit/3f2aaf99be71a1c052c66243ac5308b1c7ae3a96))
- **bson:** make TypeEncoder also validate on encode and on the decoded value to ([d803bfb](https://github.com/deepkit/deepkit-framework/commit/d803bfbac57a36d746c9650a483a437a65ce992d))

## [1.0.8](https://github.com/deepkit/deepkit-framework/compare/v1.0.7...v1.0.8) (2025-05-20)

### Features

- **bson:** add AutoBuffer to allow very fast buffer reuse in BSON serialization ([d8cdd6b](https://github.com/deepkit/deepkit-framework/commit/d8cdd6b44ac2ba880398407e4e53f3965ec71508))

## [1.0.7](https://github.com/deepkit/deepkit-framework/compare/v1.0.6...v1.0.7) (2025-04-18)

### Bug Fixes

- **bson:** serialize bigint in any container as long ([8a67d96](https://github.com/deepkit/deepkit-framework/commit/8a67d96f3aab6285ce53dd48494bc4be15b02785))

## [1.0.5](https://github.com/deepkit/deepkit-framework/compare/v1.0.4...v1.0.5) (2025-04-02)

### Bug Fixes

- **bson:** bigint with isNaN checks ([b46e228](https://github.com/deepkit/deepkit-framework/commit/b46e228428d6b09772a9a5161a7b261f93db585e))

### Features

- **bson:** convert if-else branch to lookup ([3589e62](https://github.com/deepkit/deepkit-framework/commit/3589e62f7d35b6462925758973fe54cb41aa8497))

## [1.0.3](https://github.com/deepkit/deepkit-framework/compare/v1.0.2...v1.0.3) (2025-03-13)

### Features

- **bson:** new BsonStreamReader ([3faa77a](https://github.com/deepkit/deepkit-framework/commit/3faa77a8fdf41315697670353c574b2954584dec))

## [1.0.2](https://github.com/deepkit/deepkit-framework/compare/v1.0.1...v1.0.2) (2025-02-24)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.160...v1.0.1) (2025-02-24)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.160](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.159...v1.0.1-alpha.160) (2025-02-18)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.158](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.157...v1.0.1-alpha.158) (2025-02-15)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.157](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.156...v1.0.1-alpha.157) (2025-02-15)

### Bug Fixes

- tsconfig and tsc build ([ac71e83](https://github.com/deepkit/deepkit-framework/commit/ac71e838d542a3cab0e9b1cfc20b27637f1c01df))

### Features

- update to angular 19 and typescript 5.7.3, new @deepkit/angular-ssr package ([#627](https://github.com/deepkit/deepkit-framework/issues/627)) ([52333a7](https://github.com/deepkit/deepkit-framework/commit/52333a71f98c7e25a74f048dd57f1efba61098f5))

## [1.0.1-alpha.156](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.155...v1.0.1-alpha.156) (2025-01-30)

### Bug Fixes

- **bson:** initial random value of incremental counter of ObjectId ([fb1263d](https://github.com/deepkit/deepkit-framework/commit/fb1263dbd9fbaae0bd9ecbf40f840698e4523e0c))
- **bson:** throw on invalid string data ([423df6c](https://github.com/deepkit/deepkit-framework/commit/423df6c681c226d8b4bff8c909ccd745c3c61c13))

### Features

- **bson:** decrease threshold to when TextDecoder is used to decoder utf8 ([4daed1c](https://github.com/deepkit/deepkit-framework/commit/4daed1c43e29a80c205aac35ab85317fdb936c9c))

## [1.0.1-alpha.155](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.154...v1.0.1-alpha.155) (2024-10-30)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.154](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.153...v1.0.1-alpha.154) (2024-09-06)

### Bug Fixes

- **bson:** make sure index signature keys use full utf8 encoding ([d447c1d](https://github.com/deepkit/deepkit-framework/commit/d447c1d1b12f2331aec8519fec67335151b0183a))

### Features

- **rpc:** make Buffer dependency optional ([2f32a12](https://github.com/deepkit/deepkit-framework/commit/2f32a1214c2c4555371fc1cfccdfdf533c21128e))

## [1.0.1-alpha.153](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.152...v1.0.1-alpha.153) (2024-06-06)

### Bug Fixes

- **bson:** make sure NaN is deserialized as 0 ([7b19397](https://github.com/deepkit/deepkit-framework/commit/7b193977a35fceac4402829d0709d909e3ef6f8e))

### Features

- **type:** automatically assign .path to SerializationError in TemplateState.convert() errors ([23781a1](https://github.com/deepkit/deepkit-framework/commit/23781a1949d445d769cfc3704c25bc69a27c7350))

## [1.0.1-alpha.151](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.150...v1.0.1-alpha.151) (2024-05-14)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.150](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.149...v1.0.1-alpha.150) (2024-05-09)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.149](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.148...v1.0.1-alpha.149) (2024-05-07)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.148](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.147...v1.0.1-alpha.148) (2024-05-04)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.147](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.146...v1.0.1-alpha.147) (2024-05-04)

### Bug Fixes

- **type:** make sure handled constructor properties are not set twice ([2e82eb6](https://github.com/deepkit/deepkit-framework/commit/2e82eb6fe6bb8b519b8f170334740ee9f7f988be))

## [1.0.1-alpha.146](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.145...v1.0.1-alpha.146) (2024-04-17)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.145](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.144...v1.0.1-alpha.145) (2024-04-08)

### Bug Fixes

- type guard handing of empty Map/Set ([da4cf82](https://github.com/deepkit/deepkit-framework/commit/da4cf8242a317157f8b02c67d2b5754fb8f29381))

## [1.0.1-alpha.143](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.142...v1.0.1-alpha.143) (2024-03-17)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.142](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.141...v1.0.1-alpha.142) (2024-03-06)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.141](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.140...v1.0.1-alpha.141) (2024-03-05)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.140](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.139...v1.0.1-alpha.140) (2024-03-02)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.139](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.138...v1.0.1-alpha.139) (2024-02-29)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.138](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.137...v1.0.1-alpha.138) (2024-02-27)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.137](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.136...v1.0.1-alpha.137) (2024-02-26)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.135](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.134...v1.0.1-alpha.135) (2024-02-16)

### Features

- **rpc:** reuse type cache across connections + made strictSerialization(false) less strict ([1b55b08](https://github.com/deepkit/deepkit-framework/commit/1b55b085aee23a53070daa3d179cd86734608b57))

## [1.0.1-alpha.134](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.133...v1.0.1-alpha.134) (2024-02-15)

### Bug Fixes

- **bson:** allow to serialize null to optional property ([77b0020](https://github.com/deepkit/deepkit-framework/commit/77b0020cae3af636937577458d5b584c3d6864bf))

### Features

- **rpc:** allow to disable strict serialization and validation ([d7a8155](https://github.com/deepkit/deepkit-framework/commit/d7a8155328dca9dca16c3bea88794002fa6f5cba))

## [1.0.1-alpha.133](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.132...v1.0.1-alpha.133) (2024-02-15)

### Bug Fixes

- **bson:** fix surrogate pair decoding ([cb9f648](https://github.com/deepkit/deepkit-framework/commit/cb9f648cb587c6c0553fceaf0dc57d90ac34321c))

### Features

- **bson:** export new wrapObjectId/wrapUUId for faster any serialization ([718839b](https://github.com/deepkit/deepkit-framework/commit/718839b00c404239c7b666fe1e5e2d8c2e084d99))

## [1.0.1-alpha.132](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.131...v1.0.1-alpha.132) (2024-02-10)

### Features

- **mongo:** export custom command API ([d82ccd1](https://github.com/deepkit/deepkit-framework/commit/d82ccd19df86f84e8feacbe124e1d473ff481b8c))

## [1.0.1-alpha.131](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.130...v1.0.1-alpha.131) (2024-02-09)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.124](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.123...v1.0.1-alpha.124) (2024-02-04)

### Bug Fixes

- **type:** handle more circular types ([5f6bd12](https://github.com/deepkit/deepkit-framework/commit/5f6bd124aaf9c546014b81dbded8110312f4e819)), closes [#477](https://github.com/deepkit/deepkit-framework/issues/477)

## [1.0.1-alpha.123](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.122...v1.0.1-alpha.123) (2024-02-02)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.121](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.120...v1.0.1-alpha.121) (2024-01-31)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.120](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.119...v1.0.1-alpha.120) (2024-01-29)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.119](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.118...v1.0.1-alpha.119) (2024-01-28)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.117](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.116...v1.0.1-alpha.117) (2024-01-26)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.116](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.115...v1.0.1-alpha.116) (2024-01-22)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.114](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.113...v1.0.1-alpha.114) (2024-01-21)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.113](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.112...v1.0.1-alpha.113) (2024-01-17)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.112](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.111...v1.0.1-alpha.112) (2024-01-16)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.111](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.110...v1.0.1-alpha.111) (2024-01-15)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.110](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.109...v1.0.1-alpha.110) (2024-01-11)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.109](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.108...v1.0.1-alpha.109) (2024-01-10)

### Bug Fixes

- **bson:** tests ([607d369](https://github.com/deepkit/deepkit-framework/commit/607d3693a12deafd97c3f12e3b61a0985e6de76c))

## [1.0.1-alpha.108](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.107...v1.0.1-alpha.108) (2023-11-21)

**Note:** Version bump only for package @deepkit/bson

## [1.0.1-alpha.105](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.103...v1.0.1-alpha.105) (2023-10-23)

**Note:** Version bump only for package @deepkit/bson
