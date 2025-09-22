# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.0.18](https://github.com/deepkit/deepkit-framework/compare/v1.0.17...v1.0.18) (2025-09-22)

### Bug Fixes

- **website:** resolving paths in prod build ([877698f](https://github.com/deepkit/deepkit-framework/commit/877698f8a2bddc1e955c5d0ca53d8819d0bd56a9))

### Features

- **website:** add translations (chinese, korean, japanese, german) ([4ab7058](https://github.com/deepkit/deepkit-framework/commit/4ab7058edd72a376f856c617a7f8ee243c82cd8b))

## [1.0.15](https://github.com/deepkit/deepkit-framework/compare/v1.0.14...v1.0.15) (2025-06-26)

### Features

- **desktop-ui:** refactor to standalone/signal, update angular to v20, new website docs ([#657](https://github.com/deepkit/deepkit-framework/issues/657)) ([a39d26c](https://github.com/deepkit/deepkit-framework/commit/a39d26cd527947cb93c113434f1a29f4cc014d22))

## [1.0.12](https://github.com/deepkit/deepkit-framework/compare/v1.0.11...v1.0.12) (2025-06-05)

**Note:** Version bump only for package @deepkit/http

## [1.0.11](https://github.com/deepkit/deepkit-framework/compare/v1.0.10...v1.0.11) (2025-06-02)

**Note:** Version bump only for package @deepkit/http

## [1.0.9](https://github.com/deepkit/deepkit-framework/compare/v1.0.8...v1.0.9) (2025-05-23)

**Note:** Version bump only for package @deepkit/http

## [1.0.8](https://github.com/deepkit/deepkit-framework/compare/v1.0.7...v1.0.8) (2025-05-20)

### Bug Fixes

- **http:** proper handling of form & multipart values, plus multipart JSON field support ([#649](https://github.com/deepkit/deepkit-framework/issues/649)) ([7383c73](https://github.com/deepkit/deepkit-framework/commit/7383c7354a770076f92ffffa27eb4772b1fa434e))
- **http:** support array json request bodies ([2d3274e](https://github.com/deepkit/deepkit-framework/commit/2d3274e61f5c3fb10eabc186e8a8cfd66846a06f))

## [1.0.5](https://github.com/deepkit/deepkit-framework/compare/v1.0.4...v1.0.5) (2025-04-02)

### Features

- **injector:** refactor internal code to get big performance improvement ([f295c5e](https://github.com/deepkit/deepkit-framework/commit/f295c5e77507f234ae2ee3cffdd55561ef294998))

## [1.0.3](https://github.com/deepkit/deepkit-framework/compare/v1.0.2...v1.0.3) (2025-03-13)

### Bug Fixes

- **http:** better defaults for new formidable version ([5c9788e](https://github.com/deepkit/deepkit-framework/commit/5c9788ebfb4b3ab3f056cbaa1ff79a109015f5ba))

### Features

- **event:** align API with Event web standards ([0e1dca2](https://github.com/deepkit/deepkit-framework/commit/0e1dca28fd8bbfb5232f9f9df4654598744d77a0))
- **injector:** improve error messages, make it very clear what failed and where providers are located ([5866eda](https://github.com/deepkit/deepkit-framework/commit/5866eda8ece1705bb9d1df655d53c70cd77f43a8))
- **rpc:** automatically garbage collect observables + new event system + stats collection ([d727232](https://github.com/deepkit/deepkit-framework/commit/d727232ca4b445a6bc82de8df31e25ba2d60d683))

### BREAKING CHANGES

- **event:** stopPropagation() becomes stopImmediatePropagation().

New BaseEvent.preventDefault() which replaces custom solutions like stop() in DatabaseEvent.

## [1.0.2](https://github.com/deepkit/deepkit-framework/compare/v1.0.1...v1.0.2) (2025-02-24)

**Note:** Version bump only for package @deepkit/http

## [1.0.1](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.160...v1.0.1) (2025-02-24)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.160](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.159...v1.0.1-alpha.160) (2025-02-18)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.158](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.157...v1.0.1-alpha.158) (2025-02-15)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.157](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.156...v1.0.1-alpha.157) (2025-02-15)

### Bug Fixes

- **http:** isElementStruct with null ([04e54b0](https://github.com/deepkit/deepkit-framework/commit/04e54b0dd7888592fa9db1adbf3003b1e4abe4fa))
- **type:** convert TypeAnnotation into intrinsic type ([#629](https://github.com/deepkit/deepkit-framework/issues/629)) ([4d1a13e](https://github.com/deepkit/deepkit-framework/commit/4d1a13ec11536e1951f5e348bd0b43b2244cccca)), closes [#626](https://github.com/deepkit/deepkit-framework/issues/626)

### Features

- **http:** update formidable to ^3.5.2 ([e4007c3](https://github.com/deepkit/deepkit-framework/commit/e4007c39a63dddeb7dadbdd8914cfaa954a059e7))
- update to angular 19 and typescript 5.7.3, new @deepkit/angular-ssr package ([#627](https://github.com/deepkit/deepkit-framework/issues/627)) ([52333a7](https://github.com/deepkit/deepkit-framework/commit/52333a71f98c7e25a74f048dd57f1efba61098f5))

## [1.0.1-alpha.156](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.155...v1.0.1-alpha.156) (2025-01-30)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.155](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.154...v1.0.1-alpha.155) (2024-10-30)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.154](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.153...v1.0.1-alpha.154) (2024-09-06)

### Features

- **http:** http timeout options ([44fbf56](https://github.com/deepkit/deepkit-framework/commit/44fbf5672344f6296de6f62ca2295be17d88501f))

## [1.0.1-alpha.153](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.152...v1.0.1-alpha.153) (2024-06-06)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.151](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.150...v1.0.1-alpha.151) (2024-05-14)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.150](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.149...v1.0.1-alpha.150) (2024-05-09)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.149](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.148...v1.0.1-alpha.149) (2024-05-07)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.148](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.147...v1.0.1-alpha.148) (2024-05-04)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.147](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.146...v1.0.1-alpha.147) (2024-05-04)

### Bug Fixes

- **http:** support for JSON array payloads ([#564](https://github.com/deepkit/deepkit-framework/issues/564)) ([feeeaa6](https://github.com/deepkit/deepkit-framework/commit/feeeaa6ef9f76d67f85b25f4d243b27ceb00360b))

## [1.0.1-alpha.146](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.145...v1.0.1-alpha.146) (2024-04-17)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.145](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.144...v1.0.1-alpha.145) (2024-04-08)

### Bug Fixes

- **http:** make sure invalid formidable files are skipped ([d1ff09b](https://github.com/deepkit/deepkit-framework/commit/d1ff09ba17e82891b25c192dec7bdf2d9b921f24))

## [1.0.1-alpha.143](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.142...v1.0.1-alpha.143) (2024-03-17)

### Bug Fixes

- **http:** parameter service injection into route methods with encapsulated modules ([9c98f8b](https://github.com/deepkit/deepkit-framework/commit/9c98f8b110078ab35882fece44f45fde34a4feeb))

## [1.0.1-alpha.142](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.141...v1.0.1-alpha.142) (2024-03-06)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.141](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.140...v1.0.1-alpha.141) (2024-03-05)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.140](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.139...v1.0.1-alpha.140) (2024-03-02)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.139](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.138...v1.0.1-alpha.139) (2024-02-29)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.138](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.137...v1.0.1-alpha.138) (2024-02-27)

### Bug Fixes

- **type:** make sure methods are not part of deserialization/type guard union resolver ([eb08a73](https://github.com/deepkit/deepkit-framework/commit/eb08a73db15c4d66f69646fe9f34b3c884e602a6))

## [1.0.1-alpha.137](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.136...v1.0.1-alpha.137) (2024-02-26)

### Bug Fixes

- **type:** correctly type guard `null` in optional properties ([c0adcb0](https://github.com/deepkit/deepkit-framework/commit/c0adcb00ce100b4c01bc6a1d793396b806464f3c))

## [1.0.1-alpha.134](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.133...v1.0.1-alpha.134) (2024-02-15)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.133](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.132...v1.0.1-alpha.133) (2024-02-15)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.132](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.131...v1.0.1-alpha.132) (2024-02-10)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.131](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.130...v1.0.1-alpha.131) (2024-02-09)

### Bug Fixes

- **http:** make sure all path parameters are available in HttpRequestParser ([e215420](https://github.com/deepkit/deepkit-framework/commit/e215420edf4889d116b01ca0f52109e7167e7b63))

## [1.0.1-alpha.130](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.129...v1.0.1-alpha.130) (2024-02-07)

### Bug Fixes

- **http:** don't include resolver/DI objects into HttpRequestParser ([be189c5](https://github.com/deepkit/deepkit-framework/commit/be189c5bcf8d5d57e5c9a1738e458e370bff2b50))

### Features

- **http:** allow to fetch unused path parameters in HttpRequestParser ([cc3cd3b](https://github.com/deepkit/deepkit-framework/commit/cc3cd3bc4a0a75906e43ae764bff473a81b09d1b))

## [1.0.1-alpha.129](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.128...v1.0.1-alpha.129) (2024-02-07)

### Features

- **http:** also read path parameters in HttpRequestParser<T> ([888d058](https://github.com/deepkit/deepkit-framework/commit/888d058b900b29fa39a2d77a6aa5e8946f2ee5e7))

## [1.0.1-alpha.128](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.127...v1.0.1-alpha.128) (2024-02-06)

### Features

- **http:** add new HttpRequestParser<T> injection token ([6101f83](https://github.com/deepkit/deepkit-framework/commit/6101f830897e071e72b8e873bda6dbeee69cdc1e))

## [1.0.1-alpha.124](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.123...v1.0.1-alpha.124) (2024-02-04)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.123](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.122...v1.0.1-alpha.123) (2024-02-02)

### Bug Fixes

- **injector:** resolve deps of exported providers correctly ([c185b38](https://github.com/deepkit/deepkit-framework/commit/c185b383c3314f08c92b65c76776864a2065a2b8))

## [1.0.1-alpha.122](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.121...v1.0.1-alpha.122) (2024-01-31)

### Features

- **injector:** new Module.configureProvider<T>(Fn) with configuration callback ([1739b95](https://github.com/deepkit/deepkit-framework/commit/1739b9564dcf4d254dd3041dc71945290e06ad4c))

## [1.0.1-alpha.121](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.120...v1.0.1-alpha.121) (2024-01-31)

### Features

- **http:** allow using unknown/any/never types that are nominal ([3221ff0](https://github.com/deepkit/deepkit-framework/commit/3221ff05ad2a2d426aa8da24c94678a672942831))

## [1.0.1-alpha.120](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.119...v1.0.1-alpha.120) (2024-01-29)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.119](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.118...v1.0.1-alpha.119) (2024-01-28)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.118](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.117...v1.0.1-alpha.118) (2024-01-27)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.117](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.116...v1.0.1-alpha.117) (2024-01-26)

### Features

- **http:** support non-class types as DI tokens in route actions ([a296570](https://github.com/deepkit/deepkit-framework/commit/a296570e015df1d3b5539ec66ea5723843178c1b))

## [1.0.1-alpha.116](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.115...v1.0.1-alpha.116) (2024-01-22)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.115](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.114...v1.0.1-alpha.115) (2024-01-21)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.114](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.113...v1.0.1-alpha.114) (2024-01-21)

### Bug Fixes

- **http:** make sure HttpHeader options is defined ([ea251ed](https://github.com/deepkit/deepkit-framework/commit/ea251ed2c6a2500633ec8d5c1593c29887e31868))

## [1.0.1-alpha.113](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.112...v1.0.1-alpha.113) (2024-01-17)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.112](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.111...v1.0.1-alpha.112) (2024-01-16)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.111](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.110...v1.0.1-alpha.111) (2024-01-15)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.110](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.109...v1.0.1-alpha.110) (2024-01-11)

**Note:** Version bump only for package @deepkit/http

## [1.0.1-alpha.109](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.108...v1.0.1-alpha.109) (2024-01-10)

### Bug Fixes

- **http:** use default values of route parameters if no http value was provided. ([fa74d16](https://github.com/deepkit/deepkit-framework/commit/fa74d166d5421f8459f64c9b2339b9cf272a1b18)), closes [#529](https://github.com/deepkit/deepkit-framework/issues/529)

## [1.0.1-alpha.108](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.107...v1.0.1-alpha.108) (2023-11-21)

### Bug Fixes

- **http:** fix tests to reflect new error reporting ([1eb83ff](https://github.com/deepkit/deepkit-framework/commit/1eb83ff2ba669fc9410269023e23b863c44e4257))

## [1.0.1-alpha.105](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.103...v1.0.1-alpha.105) (2023-10-23)

### Bug Fixes

- **type:** do not interfere with type checking when intersecting multiple type annotations. ([af85f1f](https://github.com/deepkit/deepkit-framework/commit/af85f1ff48c4be9fbd9a2ecd46e7f97b0bbb28c7))
