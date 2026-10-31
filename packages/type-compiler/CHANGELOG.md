# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.1.0](https://github.com/deepkit/deepkit-framework/compare/v1.0.19...v1.1.0) (2026-10-31)

### Bug Fixes

- **compiler:** module type for nodenext ([35ff3b9](https://github.com/deepkit/deepkit-framework/commit/35ff3b98c1e9ee79f25d8f5cbb09a6350f5e3045))
- **type-compiler:** correct plugin export paths ([1cc3068](https://github.com/deepkit/deepkit-framework/commit/1cc3068ab65208f01e3a5f13e9f2184cb6dc2929))
- **type-compiler:** detect the module format of .mts/.cts files and nested packages ([8cb50c6](https://github.com/deepkit/deepkit-framework/commit/8cb50c650ea405f6c962a0c35e0009e7dd99878d)), closes [#639](https://github.com/deepkit/deepkit-framework/issues/639)
- **type-compiler:** hoist \_\_type of module-level functions ([#664](https://github.com/deepkit/deepkit-framework/issues/664)) ([4492545](https://github.com/deepkit/deepkit-framework/commit/44925457ba5d0b3403e7e8ad3a7f5e690cc62ec2))
- **type-compiler:** keep forwardRef(() => Type) undecorated for Angular's linker ([c097e96](https://github.com/deepkit/deepkit-framework/commit/c097e96199ce37039abb6eb358498f1c96fe6c5a))
- **type-compiler:** load the lib files of all targets, including ES2024 and later ([b234b52](https://github.com/deepkit/deepkit-framework/commit/b234b520aabb82924f814e70315f1c4b2bf27e5c))
- **type-compiler:** re-export type programs of named re-exports ([#634](https://github.com/deepkit/deepkit-framework/issues/634), [#318](https://github.com/deepkit/deepkit-framework/issues/318)) ([e8543b1](https://github.com/deepkit/deepkit-framework/commit/e8543b1704a271da8341087f09de7f38dd8735c1))
- **type-compiler:** replace whole type reference when inferring a type parameter ([#509](https://github.com/deepkit/deepkit-framework/issues/509)) ([f4495fe](https://github.com/deepkit/deepkit-framework/commit/f4495fe293ec231e41cdcafe1b8acfda195a2f9f))
- **type-compiler:** resolve types from .mts and .cts files ([493b2bb](https://github.com/deepkit/deepkit-framework/commit/493b2bb1d4cd4277a1e00d0a93c4213cb2d1d938))
- **type-compiler:** skip type programs for declare statements ([#601](https://github.com/deepkit/deepkit-framework/issues/601)) ([77b865f](https://github.com/deepkit/deepkit-framework/commit/77b865fa0039a5c2c68ce3a4a80253fe67bcdd31))
- **type-compiler:** support calls with type arguments in optional chains ([#612](https://github.com/deepkit/deepkit-framework/issues/612)) ([9a1f315](https://github.com/deepkit/deepkit-framework/commit/9a1f315ecfd31ae159e25db75cf699e250f9eca3))
- **type-compiler:** support tsconfig extends as array ([#600](https://github.com/deepkit/deepkit-framework/issues/600)) ([bdc6533](https://github.com/deepkit/deepkit-framework/commit/bdc6533f92ae8cada68606cfe52f4946ee7766b2))
- **type-compiler:** support TypeScript versions before 5.5 ([7e6cbca](https://github.com/deepkit/deepkit-framework/commit/7e6cbcaa5fd33bfbdc117535c0ec2eeb7bc7737d))
- **type,type-compiler,bson:** useful union errors, default and aliased imports of library types ([97074f8](https://github.com/deepkit/deepkit-framework/commit/97074f859b9f2d377b3c3ba7bdd91820670a92b5)), closes [#577](https://github.com/deepkit/deepkit-framework/issues/577) [#676](https://github.com/deepkit/deepkit-framework/issues/676) [#601](https://github.com/deepkit/deepkit-framework/issues/601)
- **vite,type-compiler:** accept FilterPattern for include and exclude ([#696](https://github.com/deepkit/deepkit-framework/issues/696)) ([c1bcfda](https://github.com/deepkit/deepkit-framework/commit/c1bcfdadccc97859db16b0d55f2ab07933dee0b9))

### Features

- enable isolatedModules ([#683](https://github.com/deepkit/deepkit-framework/issues/683)) ([c730cfc](https://github.com/deepkit/deepkit-framework/commit/c730cfcfadc898f632b3c64b90ca57fa6764af32))
- **type:** support intrinsics Capitalize, Uppercase, Lowercase, Uncapitalize ([#681](https://github.com/deepkit/deepkit-framework/issues/681)) ([ffd1bc7](https://github.com/deepkit/deepkit-framework/commit/ffd1bc7b55cf08ce23be440bab33dd6925299d1c))

### Performance Improvements

- **type,type-compiler,core:** faster type guards, type arguments and serializer calls ([c39c8fd](https://github.com/deepkit/deepkit-framework/commit/c39c8fd8838fa205400507ba0146918333186044)), closes [#568](https://github.com/deepkit/deepkit-framework/issues/568)

### BREAKING CHANGES

- const enums converted to regular enums in:
  - MappedModifier (type-spec)
  - BinaryBigIntType (type)
  - BrokerType (broker)
  - RpcMessageRouteType (rpc)
  - AuthMechanism (mongo)

## [1.0.19](https://github.com/deepkit/deepkit-framework/compare/v1.0.17...v1.0.19) (2025-09-22)

### Bug Fixes

- **type-compiler:** ensure typed imports are grouped and not too high up, but placed right in front of the origin import ([9f666c1](https://github.com/deepkit/deepkit-framework/commit/9f666c104bb38abc4396c99e281fd6605a9e2884))

## [1.0.18](https://github.com/deepkit/deepkit-framework/compare/v1.0.17...v1.0.18) (2025-09-22)

### Bug Fixes

- **type-compiler:** ensure typed imports are grouped and not too high up, but placed right in front of the origin import ([9f666c1](https://github.com/deepkit/deepkit-framework/commit/9f666c104bb38abc4396c99e281fd6605a9e2884))

## [1.0.15](https://github.com/deepkit/deepkit-framework/compare/v1.0.14...v1.0.15) (2025-06-26)

### Features

- **desktop-ui:** refactor to standalone/signal, update angular to v20, new website docs ([#657](https://github.com/deepkit/deepkit-framework/issues/657)) ([a39d26c](https://github.com/deepkit/deepkit-framework/commit/a39d26cd527947cb93c113434f1a29f4cc014d22))

## [1.0.8](https://github.com/deepkit/deepkit-framework/compare/v1.0.7...v1.0.8) (2025-05-20)

**Note:** Version bump only for package @deepkit/type-compiler

## [1.0.5](https://github.com/deepkit/deepkit-framework/compare/v1.0.4...v1.0.5) (2025-04-02)

### Features

- **run:** new @deepkit/run package to run typescript easily ([0b9246e](https://github.com/deepkit/deepkit-framework/commit/0b9246edaab9deb80b6855cba90f48baa4562e08))

## [1.0.2](https://github.com/deepkit/deepkit-framework/compare/v1.0.1...v1.0.2) (2025-02-24)

### Bug Fixes

- **type-compiler:** make sure not annotated properties get unknown as type ([b262534](https://github.com/deepkit/deepkit-framework/commit/b262534d5c516c975b9b7d818539f92043f5736e))

## [1.0.1](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.160...v1.0.1) (2025-02-24)

### Bug Fixes

- **type-compiler:** check in installer if file exists ([eb07783](https://github.com/deepkit/deepkit-framework/commit/eb0778318fb369b0eaabb9ee04d76f88d27f4f90)), closes [#630](https://github.com/deepkit/deepkit-framework/issues/630)

## [1.0.1-alpha.158](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.157...v1.0.1-alpha.158) (2025-02-15)

**Note:** Version bump only for package @deepkit/type-compiler

## [1.0.1-alpha.157](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.156...v1.0.1-alpha.157) (2025-02-15)

### Bug Fixes

- tsconfig and tsc build ([ac71e83](https://github.com/deepkit/deepkit-framework/commit/ac71e838d542a3cab0e9b1cfc20b27637f1c01df))
- **type:** convert TypeAnnotation into intrinsic type ([#629](https://github.com/deepkit/deepkit-framework/issues/629)) ([4d1a13e](https://github.com/deepkit/deepkit-framework/commit/4d1a13ec11536e1951f5e348bd0b43b2244cccca)), closes [#626](https://github.com/deepkit/deepkit-framework/issues/626)

### Features

- **type-compiler:** support trivially inferred types ([087b60a](https://github.com/deepkit/deepkit-framework/commit/087b60ae8f964dd4e9f477c9346234ef79ccef4a))
- update to angular 19 and typescript 5.7.3, new @deepkit/angular-ssr package ([#627](https://github.com/deepkit/deepkit-framework/issues/627)) ([52333a7](https://github.com/deepkit/deepkit-framework/commit/52333a71f98c7e25a74f048dd57f1efba61098f5))

## [1.0.1-alpha.155](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.154...v1.0.1-alpha.155) (2024-10-30)

### Bug Fixes

- **type:** symbols as method names ([2be4ce6](https://github.com/deepkit/deepkit-framework/commit/2be4ce6e728197c55524fc1f009b6a2946af022f))

## [1.0.1-alpha.154](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.153...v1.0.1-alpha.154) (2024-09-06)

### Bug Fixes

- **type-compiler:** include enum annotations in .d.ts transformation ([#607](https://github.com/deepkit/deepkit-framework/issues/607)) ([08854f3](https://github.com/deepkit/deepkit-framework/commit/08854f3d1aff429b70c384aeaf54538b1f49c079))

## [1.0.1-alpha.150](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.149...v1.0.1-alpha.150) (2024-05-09)

### Bug Fixes

- **type-compiler:** support ReceiveType in arrow function with body expression ([3c66064](https://github.com/deepkit/deepkit-framework/commit/3c660640ba5ef7ac447d31b59abaf4f37bd341de))

### Features

- **type-compiler:** allow to use T from ReceiveType<T> in function body as type reference ([4d24c8b](https://github.com/deepkit/deepkit-framework/commit/4d24c8b33197e163ba75eb9483349d269502dc76)), closes [#565](https://github.com/deepkit/deepkit-framework/issues/565)

## [1.0.1-alpha.149](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.148...v1.0.1-alpha.149) (2024-05-07)

### Bug Fixes

- **type-compiler:** make sure type reference resolving skips parameter names ([16ba17d](https://github.com/deepkit/deepkit-framework/commit/16ba17d728cb6f66db7ff3463ee05a893986b29b)), closes [#566](https://github.com/deepkit/deepkit-framework/issues/566)

## [1.0.1-alpha.146](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.145...v1.0.1-alpha.146) (2024-04-17)

### Bug Fixes

- **type-compiler:** esm import of micromatch ([5606d74](https://github.com/deepkit/deepkit-framework/commit/5606d7404ad4ff1e94c5c12cbf94a532e9ae41ce))

## [1.0.1-alpha.143](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.142...v1.0.1-alpha.143) (2024-03-17)

### Bug Fixes

- **type-compiler:** also parse tsx source files ([80464bf](https://github.com/deepkit/deepkit-framework/commit/80464bf2bd38477e7ce7898fde17b6d6738007f7)), closes [#560](https://github.com/deepkit/deepkit-framework/issues/560)

## [1.0.1-alpha.142](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.141...v1.0.1-alpha.142) (2024-03-06)

### Bug Fixes

- **type-compiler:** support windows reflection pattern matching ([cec3146](https://github.com/deepkit/deepkit-framework/commit/cec3146612b7b950cbd47eb2850feb887b87fc82))

## [1.0.1-alpha.141](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.140...v1.0.1-alpha.141) (2024-03-05)

### Bug Fixes

- **type:** handle `Function` correctly in type comparisons ([16f0c1d](https://github.com/deepkit/deepkit-framework/commit/16f0c1da4b6e2ce216c45681e1574bfe68c9044f))

## [1.0.1-alpha.139](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.138...v1.0.1-alpha.139) (2024-02-29)

### Bug Fixes

- **type-compiler:** mark the right SourceFile object as processed ([38cfdf0](https://github.com/deepkit/deepkit-framework/commit/38cfdf06910cfbd01755805022f97ed6afa8dd4d))

## [1.0.1-alpha.123](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.122...v1.0.1-alpha.123) (2024-02-02)

**Note:** Version bump only for package @deepkit/type-compiler

## [1.0.1-alpha.117](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.116...v1.0.1-alpha.117) (2024-01-26)

### Bug Fixes

- **type-compiler:** embed external class/functions ([ad6973d](https://github.com/deepkit/deepkit-framework/commit/ad6973dfbe32f9399ceabb39b6499255287cdb22))
- **type-compiler:** merge compilerOptions from ConfigResolver ([7b00789](https://github.com/deepkit/deepkit-framework/commit/7b0078913e5ab381c23dc807fcc86648777ff096))
- **type-compiler:** pattern match exclusion for globs ([#543](https://github.com/deepkit/deepkit-framework/issues/543)) ([30e3319](https://github.com/deepkit/deepkit-framework/commit/30e331942978e528fb5ae3cda2a37541748f562b))

### Features

- **type-compiler:** improve perf by 10x ([6eb0436](https://github.com/deepkit/deepkit-framework/commit/6eb0436c67c11e69c4f694ed9c6ab931c6d840de))
- **type-compiler:** support local export syntax + improve logging ([993cffa](https://github.com/deepkit/deepkit-framework/commit/993cffaa822a76963ed5185d8b1d0a7c1de28069))

## [1.0.1-alpha.116](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.115...v1.0.1-alpha.116) (2024-01-22)

### Features

- **type:** refactor typeName embedding ([48a2994](https://github.com/deepkit/deepkit-framework/commit/48a29944064d03d108988949a1ff5b6e42395b57))

## [1.0.1-alpha.114](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.113...v1.0.1-alpha.114) (2024-01-21)

### Bug Fixes

- **type-compiler:** support nodenext/node16 module type ([5e40fae](https://github.com/deepkit/deepkit-framework/commit/5e40faef6c72687853cdd877c1d4b0d98756e3ab))

### Features

- **type-compiler:** improve performance drastically ([1d80c1a](https://github.com/deepkit/deepkit-framework/commit/1d80c1a44f8ff0b3f07bc801992ce570cb4f5962))

## [1.0.1-alpha.112](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.111...v1.0.1-alpha.112) (2024-01-16)

### Features

- **app:** improve CLI outputs/parsing by removing [@oclif](https://github.com/oclif) ([e38bbd1](https://github.com/deepkit/deepkit-framework/commit/e38bbd143daa2c856c57eca07a4fd29e884fe97e))

## [1.0.1-alpha.110](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.109...v1.0.1-alpha.110) (2024-01-11)

### Bug Fixes

- **type-compiler:** make sure plugin is exported in new entrypoint + deps are correct ([22eb296](https://github.com/deepkit/deepkit-framework/commit/22eb296d0001c59ca6c6c928d5834f4329f394d0))

## [1.0.1-alpha.109](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.108...v1.0.1-alpha.109) (2024-01-10)

### Bug Fixes

- **type-compiler:** arrow function receive type ([#521](https://github.com/deepkit/deepkit-framework/issues/521)) ([6bfb246](https://github.com/deepkit/deepkit-framework/commit/6bfb2466753bb99020d8f429097ad1cb3520e500))
- **type-compiler:** resolve reflection mode paths correctly ([acb2d72](https://github.com/deepkit/deepkit-framework/commit/acb2d72f242a742fe99fdcf9fba892faea701e08))
- **type-compiler:** set ts compiler options target to es2022 if higher than es20222 when resolving global lib files ([#516](https://github.com/deepkit/deepkit-framework/issues/516)) ([29a1a17](https://github.com/deepkit/deepkit-framework/commit/29a1a17c0092c6304497c28184d8c5b8790b35e5))

## [1.0.1-alpha.108](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.107...v1.0.1-alpha.108) (2023-11-21)

### Features

- **type-compiler:** emit typeName for type only imports ([#501](https://github.com/deepkit/deepkit-framework/issues/501)) ([318d091](https://github.com/deepkit/deepkit-framework/commit/318d091b9418df0a77f85de18d37541c3f9e3428))

## [1.0.1-alpha.105](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.103...v1.0.1-alpha.105) (2023-10-23)

### Bug Fixes

- **type-compiler:** wrong import ([caad2b3](https://github.com/deepkit/deepkit-framework/commit/caad2b39972d284e4eab9a8cedf9c3e95997c789))
