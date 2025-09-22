# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.0.19](https://github.com/deepkit/deepkit-framework/compare/v1.0.17...v1.0.19) (2025-09-22)

### Features

- **website:** add translations (chinese, korean, japanese, german) ([4ab7058](https://github.com/deepkit/deepkit-framework/commit/4ab7058edd72a376f856c617a7f8ee243c82cd8b))

## [1.0.18](https://github.com/deepkit/deepkit-framework/compare/v1.0.17...v1.0.18) (2025-09-22)

### Features

- **website:** add translations (chinese, korean, japanese, german) ([4ab7058](https://github.com/deepkit/deepkit-framework/commit/4ab7058edd72a376f856c617a7f8ee243c82cd8b))

## [1.0.15](https://github.com/deepkit/deepkit-framework/compare/v1.0.14...v1.0.15) (2025-06-26)

### Features

- **desktop-ui:** refactor to standalone/signal, update angular to v20, new website docs ([#657](https://github.com/deepkit/deepkit-framework/issues/657)) ([a39d26c](https://github.com/deepkit/deepkit-framework/commit/a39d26cd527947cb93c113434f1a29f4cc014d22))

## [1.0.12](https://github.com/deepkit/deepkit-framework/compare/v1.0.11...v1.0.12) (2025-06-05)

### Features

- **app:** infer AppModule config from extend expression, make sure to unsubscribe unhandledRejection when command is done ([c81841b](https://github.com/deepkit/deepkit-framework/commit/c81841beb0df2710a13acf6922d65bc63057b5ca))

## [1.0.11](https://github.com/deepkit/deepkit-framework/compare/v1.0.10...v1.0.11) (2025-06-02)

### Bug Fixes

- **type:** don't flatten union members that are annotated ([9f83f6c](https://github.com/deepkit/deepkit-framework/commit/9f83f6cf12afbbbe031d82ab6e4ac9a5dd049cd7))

## [1.0.8](https://github.com/deepkit/deepkit-framework/compare/v1.0.7...v1.0.8) (2025-05-20)

**Note:** Version bump only for package @deepkit/type

## [1.0.5](https://github.com/deepkit/deepkit-framework/compare/v1.0.4...v1.0.5) (2025-04-02)

### Features

- **run:** new @deepkit/run package to run typescript easily ([0b9246e](https://github.com/deepkit/deepkit-framework/commit/0b9246edaab9deb80b6855cba90f48baa4562e08))

## [1.0.3](https://github.com/deepkit/deepkit-framework/compare/v1.0.2...v1.0.3) (2025-03-13)

### Features

- **rpc:** automatically garbage collect observables + new event system + stats collection ([d727232](https://github.com/deepkit/deepkit-framework/commit/d727232ca4b445a6bc82de8df31e25ba2d60d683))

## [1.0.2](https://github.com/deepkit/deepkit-framework/compare/v1.0.1...v1.0.2) (2025-02-24)

### Bug Fixes

- **type-compiler:** make sure not annotated properties get unknown as type ([b262534](https://github.com/deepkit/deepkit-framework/commit/b262534d5c516c975b9b7d818539f92043f5736e))

## [1.0.1](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.160...v1.0.1) (2025-02-24)

**Note:** Version bump only for package @deepkit/type

## [1.0.1-alpha.160](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.159...v1.0.1-alpha.160) (2025-02-18)

### Bug Fixes

- **type:** make typeAnnotation backwards compatible to metaAnnotation ([8be8b5e](https://github.com/deepkit/deepkit-framework/commit/8be8b5e154eca10fc7cd398347886209d2fa49ae))

## [1.0.1-alpha.158](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.157...v1.0.1-alpha.158) (2025-02-15)

**Note:** Version bump only for package @deepkit/type

## [1.0.1-alpha.157](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.156...v1.0.1-alpha.157) (2025-02-15)

### Bug Fixes

- tsconfig and tsc build ([ac71e83](https://github.com/deepkit/deepkit-framework/commit/ac71e838d542a3cab0e9b1cfc20b27637f1c01df))
- **type:** convert TypeAnnotation into intrinsic type ([#629](https://github.com/deepkit/deepkit-framework/issues/629)) ([4d1a13e](https://github.com/deepkit/deepkit-framework/commit/4d1a13ec11536e1951f5e348bd0b43b2244cccca)), closes [#626](https://github.com/deepkit/deepkit-framework/issues/626)
- **type:** ensure union check in deserialize mode to handle property with default value correctly ([11c2116](https://github.com/deepkit/deepkit-framework/commit/11c21167a06e6eaee46941d4aee13323581caa52)), closes [#623](https://github.com/deepkit/deepkit-framework/issues/623)
- **type:** remove debug code ([fefd9a3](https://github.com/deepkit/deepkit-framework/commit/fefd9a33a8c9c7edf0267ece2e6f33b4913cd173))

### Features

- **type-compiler:** support trivially inferred types ([087b60a](https://github.com/deepkit/deepkit-framework/commit/087b60ae8f964dd4e9f477c9346234ef79ccef4a))
- update to angular 19 and typescript 5.7.3, new @deepkit/angular-ssr package ([#627](https://github.com/deepkit/deepkit-framework/issues/627)) ([52333a7](https://github.com/deepkit/deepkit-framework/commit/52333a71f98c7e25a74f048dd57f1efba61098f5))

## [1.0.1-alpha.156](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.155...v1.0.1-alpha.156) (2025-01-30)

### Bug Fixes

- **type:** make sure forwarded type arguments reset Ω at the origin ([3138671](https://github.com/deepkit/deepkit-framework/commit/31386718f3fc634983c0eedd652105765e3e6a75)), closes [#619](https://github.com/deepkit/deepkit-framework/issues/619)

## [1.0.1-alpha.155](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.154...v1.0.1-alpha.155) (2024-10-30)

### Bug Fixes

- **type:** add executeTypeArgumentAsArray + custom iterable example with manual implementation ([0781a1a](https://github.com/deepkit/deepkit-framework/commit/0781a1ab733a5b06b0c89ec854274e0a8115696a))
- **type:** symbols as method names ([2be4ce6](https://github.com/deepkit/deepkit-framework/commit/2be4ce6e728197c55524fc1f009b6a2946af022f))

## [1.0.1-alpha.154](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.153...v1.0.1-alpha.154) (2024-09-06)

### Bug Fixes

- **type:** add scope in setter code to prevent `variable already declared` [#603](https://github.com/deepkit/deepkit-framework/issues/603) ([#606](https://github.com/deepkit/deepkit-framework/issues/606)) ([9af344f](https://github.com/deepkit/deepkit-framework/commit/9af344f4705943571bc0c18e73435b18c4819641))

### Features

- **type:** support enum in pathResolver/resolvePath ([78d7df0](https://github.com/deepkit/deepkit-framework/commit/78d7df08af6845c3986bc55a7c8b1dc3353d8847))

## [1.0.1-alpha.153](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.152...v1.0.1-alpha.153) (2024-06-06)

### Bug Fixes

- **orm:** correctly resolve reference class schemas ([e193325](https://github.com/deepkit/deepkit-framework/commit/e193325b561563f0207403103cd8caf859228cc2))

### Features

- **orm:** support passing type to Database.persistAs/Database.removeAs, DatabaseSession.addAs ([6679aba](https://github.com/deepkit/deepkit-framework/commit/6679aba8517b46575b92edaa3a9f59ea90f9f762)), closes [#571](https://github.com/deepkit/deepkit-framework/issues/571)
- **type:** automatically assign .path to SerializationError in TemplateState.convert() errors ([23781a1](https://github.com/deepkit/deepkit-framework/commit/23781a1949d445d769cfc3704c25bc69a27c7350))

## [1.0.1-alpha.151](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.150...v1.0.1-alpha.151) (2024-05-14)

### Features

- **type:** return all errors when validating array ([#568](https://github.com/deepkit/deepkit-framework/issues/568)) ([c2ca10e](https://github.com/deepkit/deepkit-framework/commit/c2ca10ec33bb0b00568563a225e4ca0f2f92a6cb)), closes [/github.com/deepkit/deepkit-framework/issues/565#issuecomment-2091054710](https://github.com//github.com/deepkit/deepkit-framework/issues/565/issues/issuecomment-2091054710)

## [1.0.1-alpha.150](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.149...v1.0.1-alpha.150) (2024-05-09)

### Bug Fixes

- **rpc:** ensure data is not chunked twice in server->client controllers ([6c59f9b](https://github.com/deepkit/deepkit-framework/commit/6c59f9bda5830dc11f85b555e7ecd618e10708f8))
- **type-compiler:** support ReceiveType in arrow function with body expression ([3c66064](https://github.com/deepkit/deepkit-framework/commit/3c660640ba5ef7ac447d31b59abaf4f37bd341de))

### Features

- **type-compiler:** allow to use T from ReceiveType<T> in function body as type reference ([4d24c8b](https://github.com/deepkit/deepkit-framework/commit/4d24c8b33197e163ba75eb9483349d269502dc76)), closes [#565](https://github.com/deepkit/deepkit-framework/issues/565)

## [1.0.1-alpha.149](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.148...v1.0.1-alpha.149) (2024-05-07)

### Bug Fixes

- **type-compiler:** make sure type reference resolving skips parameter names ([16ba17d](https://github.com/deepkit/deepkit-framework/commit/16ba17d728cb6f66db7ff3463ee05a893986b29b)), closes [#566](https://github.com/deepkit/deepkit-framework/issues/566)

## [1.0.1-alpha.148](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.147...v1.0.1-alpha.148) (2024-05-04)

### Features

- **type:** new TemplateState.touch and isTypeClassOf ([cdf3272](https://github.com/deepkit/deepkit-framework/commit/cdf3272e05f63487c9e0da7776aa232ba1fe88b5))
- **type:** support lower/mixed case as identifier for enum values ([ce0166e](https://github.com/deepkit/deepkit-framework/commit/ce0166e5d76bc5d55a50114bd43bfaa68dbeac18))
- **type:** support mixed case enum member in union resolver ([96dd2d8](https://github.com/deepkit/deepkit-framework/commit/96dd2d864c2a0436cb5d78bada58ff82681d3045))

## [1.0.1-alpha.147](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.146...v1.0.1-alpha.147) (2024-05-04)

### Bug Fixes

- **type:** make sure handled constructor properties are not set twice ([2e82eb6](https://github.com/deepkit/deepkit-framework/commit/2e82eb6fe6bb8b519b8f170334740ee9f7f988be))
- **type:** resolve global classes as shallow TypeClass ([d976024](https://github.com/deepkit/deepkit-framework/commit/d97602409b1e8c1d63839e2d1b75d16a0ccd4cfd))

## [1.0.1-alpha.146](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.145...v1.0.1-alpha.146) (2024-04-17)

**Note:** Version bump only for package @deepkit/type

## [1.0.1-alpha.145](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.144...v1.0.1-alpha.145) (2024-04-08)

### Bug Fixes

- type guard handing of empty Map/Set ([da4cf82](https://github.com/deepkit/deepkit-framework/commit/da4cf8242a317157f8b02c67d2b5754fb8f29381))

## [1.0.1-alpha.143](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.142...v1.0.1-alpha.143) (2024-03-17)

### Bug Fixes

- **type:** union expansions in intersections ([332b26e](https://github.com/deepkit/deepkit-framework/commit/332b26eb148d916d03f49fad0daaad083c24207a)), closes [#556](https://github.com/deepkit/deepkit-framework/issues/556)

## [1.0.1-alpha.142](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.141...v1.0.1-alpha.142) (2024-03-06)

**Note:** Version bump only for package @deepkit/type

## [1.0.1-alpha.141](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.140...v1.0.1-alpha.141) (2024-03-05)

### Bug Fixes

- **type:** handle `Function` correctly in type comparisons ([16f0c1d](https://github.com/deepkit/deepkit-framework/commit/16f0c1da4b6e2ce216c45681e1574bfe68c9044f))

## [1.0.1-alpha.140](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.139...v1.0.1-alpha.140) (2024-03-02)

### Features

- **sql:** support per-field name remapping ([63b8aaf](https://github.com/deepkit/deepkit-framework/commit/63b8aaface420a98f14511b22efaffc9628be41d))

## [1.0.1-alpha.139](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.138...v1.0.1-alpha.139) (2024-02-29)

### Bug Fixes

- **type:** better error message when fast path type resolution fails due to undefined symbols ([0ef082d](https://github.com/deepkit/deepkit-framework/commit/0ef082d4b474b7d36d7668cf21ad8a9922469189))

## [1.0.1-alpha.138](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.137...v1.0.1-alpha.138) (2024-02-27)

### Bug Fixes

- **type:** make sure methods are not part of deserialization/type guard union resolver ([eb08a73](https://github.com/deepkit/deepkit-framework/commit/eb08a73db15c4d66f69646fe9f34b3c884e602a6))

## [1.0.1-alpha.137](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.136...v1.0.1-alpha.137) (2024-02-26)

### Bug Fixes

- **type:** correctly type guard `null` in optional properties ([c0adcb0](https://github.com/deepkit/deepkit-framework/commit/c0adcb00ce100b4c01bc6a1d793396b806464f3c))

## [1.0.1-alpha.132](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.131...v1.0.1-alpha.132) (2024-02-10)

### Bug Fixes

- **type:** intersection of two different primitive types always return never ([#549](https://github.com/deepkit/deepkit-framework/issues/549)) ([20d3dc8](https://github.com/deepkit/deepkit-framework/commit/20d3dc83a00431db99f6feb0f41da890fa422f48))

## [1.0.1-alpha.131](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.130...v1.0.1-alpha.131) (2024-02-09)

### Bug Fixes

- **type:** make sure cast<string> throws when null/undefined is passed ([1bb3641](https://github.com/deepkit/deepkit-framework/commit/1bb3641f3db8196c9bcab64ef17004dc5e1f9f4c))

## [1.0.1-alpha.124](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.123...v1.0.1-alpha.124) (2024-02-04)

### Bug Fixes

- **type:** handle more circular types ([5f6bd12](https://github.com/deepkit/deepkit-framework/commit/5f6bd124aaf9c546014b81dbded8110312f4e819)), closes [#477](https://github.com/deepkit/deepkit-framework/issues/477)

## [1.0.1-alpha.123](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.122...v1.0.1-alpha.123) (2024-02-02)

**Note:** Version bump only for package @deepkit/type

## [1.0.1-alpha.121](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.120...v1.0.1-alpha.121) (2024-01-31)

**Note:** Version bump only for package @deepkit/type

## [1.0.1-alpha.120](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.119...v1.0.1-alpha.120) (2024-01-29)

### Features

- **type:** preserve modifiers in homomorphic mapped types ([f2091d0](https://github.com/deepkit/deepkit-framework/commit/f2091d0beeb7360d0bdcc7475d0c88e53dee5de2)), closes [#515](https://github.com/deepkit/deepkit-framework/issues/515) [#514](https://github.com/deepkit/deepkit-framework/issues/514)

## [1.0.1-alpha.119](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.118...v1.0.1-alpha.119) (2024-01-28)

### Features

- **type:** provide parent types in serializer template state ([d65dfc0](https://github.com/deepkit/deepkit-framework/commit/d65dfc0f80ee429e1f74af05e3a3fda385855ce5))

## [1.0.1-alpha.117](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.116...v1.0.1-alpha.117) (2024-01-26)

### Bug Fixes

- **type:** correct type guard ([272cff9](https://github.com/deepkit/deepkit-framework/commit/272cff92292043c4b76bd61bc4abe3c9a63509c9))

### Features

- **type-compiler:** support local export syntax + improve logging ([993cffa](https://github.com/deepkit/deepkit-framework/commit/993cffaa822a76963ed5185d8b1d0a7c1de28069))

## [1.0.1-alpha.116](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.115...v1.0.1-alpha.116) (2024-01-22)

### Features

- **type:** refactor typeName embedding ([48a2994](https://github.com/deepkit/deepkit-framework/commit/48a29944064d03d108988949a1ff5b6e42395b57))

## [1.0.1-alpha.114](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.113...v1.0.1-alpha.114) (2024-01-21)

**Note:** Version bump only for package @deepkit/type

## [1.0.1-alpha.113](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.112...v1.0.1-alpha.113) (2024-01-17)

**Note:** Version bump only for package @deepkit/type

## [1.0.1-alpha.112](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.111...v1.0.1-alpha.112) (2024-01-16)

### Features

- **app:** improve CLI outputs/parsing by removing [@oclif](https://github.com/oclif) ([e38bbd1](https://github.com/deepkit/deepkit-framework/commit/e38bbd143daa2c856c57eca07a4fd29e884fe97e))

## [1.0.1-alpha.111](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.110...v1.0.1-alpha.111) (2024-01-15)

### Features

- **type:** add new fast path to resolveReceiveType and made it 5x faster on average use case. ([45d656c](https://github.com/deepkit/deepkit-framework/commit/45d656ccc0e4ba36fe362784e60ca58c6b2da31d))

## [1.0.1-alpha.110](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.109...v1.0.1-alpha.110) (2024-01-11)

**Note:** Version bump only for package @deepkit/type

## [1.0.1-alpha.109](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.108...v1.0.1-alpha.109) (2024-01-10)

### Bug Fixes

- **http:** use default values of route parameters if no http value was provided. ([fa74d16](https://github.com/deepkit/deepkit-framework/commit/fa74d166d5421f8459f64c9b2339b9cf272a1b18)), closes [#529](https://github.com/deepkit/deepkit-framework/issues/529)
- **orm:** snapshot type `any` correctly ([4898e9b](https://github.com/deepkit/deepkit-framework/commit/4898e9bc067b655284b08aa7e9a75b0bffedcbf6))
- **type-compiler:** arrow function receive type ([#521](https://github.com/deepkit/deepkit-framework/issues/521)) ([6bfb246](https://github.com/deepkit/deepkit-framework/commit/6bfb2466753bb99020d8f429097ad1cb3520e500))
- **type:** make serializer API consistent ([5870005](https://github.com/deepkit/deepkit-framework/commit/587000526c1ca59e28eea3b107b882151aedb08b))

## [1.0.1-alpha.108](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.107...v1.0.1-alpha.108) (2023-11-21)

### Bug Fixes

- **injector:** make sure type cache is used when finding matching provider. ([8c79e4b](https://github.com/deepkit/deepkit-framework/commit/8c79e4b1d370c21f12c203a786608b6d39dc5c56))
- **type:** correctly check `X extends Date` and print validation errors with caused value. ([fde795e](https://github.com/deepkit/deepkit-framework/commit/fde795ee6998606b0791f936a25ee85921c6586a))
- **type:** correctly materialize Promise in runtime checks. ([aa66460](https://github.com/deepkit/deepkit-framework/commit/aa66460f9b125a7070645f64f34a5574cd9eb549)), closes [#495](https://github.com/deepkit/deepkit-framework/issues/495)
- **type:** make sure `typeof x` expression doesn't return the original type ([7206e7e](https://github.com/deepkit/deepkit-framework/commit/7206e7ef9c3728e2b60d9a6cd7ecdb167fca78d0))
- **type:** make sure inline returns a ref to the correct type program ([dc5d6dd](https://github.com/deepkit/deepkit-framework/commit/dc5d6ddf36cc8835d7b11684a004f247900ec65f))

### Features

- **type-compiler:** emit typeName for type only imports ([#501](https://github.com/deepkit/deepkit-framework/issues/501)) ([318d091](https://github.com/deepkit/deepkit-framework/commit/318d091b9418df0a77f85de18d37541c3f9e3428))

## [1.0.1-alpha.105](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.103...v1.0.1-alpha.105) (2023-10-23)

### Bug Fixes

- **type:** do not interfere with type checking when intersecting multiple type annotations. ([af85f1f](https://github.com/deepkit/deepkit-framework/commit/af85f1ff48c4be9fbd9a2ecd46e7f97b0bbb28c7))
- **type:** test ([c335466](https://github.com/deepkit/deepkit-framework/commit/c3354667f996586964643d561687ed246901091c))
