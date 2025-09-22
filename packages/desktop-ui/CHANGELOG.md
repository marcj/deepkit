# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.0.18](https://github.com/deepkit/deepkit-framework/compare/v1.0.17...v1.0.18) (2025-09-22)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.17](https://github.com/deepkit/deepkit-framework/compare/v1.0.16...v1.0.17) (2025-07-03)

### Features

- **desktop-ui:** table performance improvement, decouple styles from body, improve ProgressIndicatorComponent ([5333fe6](https://github.com/deepkit/deepkit-framework/commit/5333fe6cf6a46f3c5e272df53b403c943d7c7076))

## [1.0.16](https://github.com/deepkit/deepkit-framework/compare/v1.0.15...v1.0.16) (2025-06-30)

### Bug Fixes

- **desktop-ui:** fix icon font in webkit ([87e60b5](https://github.com/deepkit/deepkit-framework/commit/87e60b525eba6b553f068b97ff97aabe424a6662))
- **desktop-ui:** remove AbortController for addEventListener since bad browser support ([a35ffe1](https://github.com/deepkit/deepkit-framework/commit/a35ffe1fc40675a4c0ea7c163f06de8fc450ce5e))

### Features

- **desktop-ui:** better docs, new dui-adaptive-container component ([e4497e8](https://github.com/deepkit/deepkit-framework/commit/e4497e8daf0de716fb49a7de3998e24d2571477f))
- **desktop-ui:** more docs ([9433089](https://github.com/deepkit/deepkit-framework/commit/94330899c817e58ae0b588243c8bd338790d9908))
- **desktop-ui:** new duiPositionChange directive, new dui-menu component, automatically reposition dropdown, improved dui-adaptive-container ([dc8fa12](https://github.com/deepkit/deepkit-framework/commit/dc8fa12852d1ac3f859752c1c350b1b3c4fea2b3))

## [1.0.15](https://github.com/deepkit/deepkit-framework/compare/v1.0.14...v1.0.15) (2025-06-26)

### Bug Fixes

- **desktop-ui:** disable SSR hydration for dui-window-header ([a6f3e4c](https://github.com/deepkit/deepkit-framework/commit/a6f3e4cc2daf009accba0af3b89ceb416d18123d))
- **desktop-ui:** fix window-sidebar visibility ([031281a](https://github.com/deepkit/deepkit-framework/commit/031281a6cf2467257824b963ea371ef13528de9b))
- **desktop-ui:** put dynamic content to gitignore ([73e40c2](https://github.com/deepkit/deepkit-framework/commit/73e40c28605144e828e6d81962ab69379e406c8d))
- **desktop-ui:** remove dynamic content from git ([ded304d](https://github.com/deepkit/deepkit-framework/commit/ded304d458fdb82231060ed58392e72bd8515144))

### Features

- **desktop-ui:** refactor to standalone/signal, update angular to v20, new website docs ([#657](https://github.com/deepkit/deepkit-framework/issues/657)) ([a39d26c](https://github.com/deepkit/deepkit-framework/commit/a39d26cd527947cb93c113434f1a29f4cc014d22))

## [1.0.14](https://github.com/deepkit/deepkit-framework/compare/v1.0.13...v1.0.14) (2025-06-22)

### Bug Fixes

- **desktop-ui:** dui-table[autoHeight] width correct styling and behaviour ([d541724](https://github.com/deepkit/deepkit-framework/commit/d541724c4417153bb4c6a59cc113d33e20d1e3e5))
- **desktop-ui:** make sure focusWatcher always closes ([d06ebb5](https://github.com/deepkit/deepkit-framework/commit/d06ebb5ec9478bdf91e1c67eeac2506f9bdc6700))
- **desktop-ui:** more fallback positions for dropdown ([74581eb](https://github.com/deepkit/deepkit-framework/commit/74581eb3add46059ac2bd67733b55e94fd7994e5))
- **desktop-ui:** resource leak of embedded view refs of dropdown/dialog ([7867335](https://github.com/deepkit/deepkit-framework/commit/78673352227a9b8ecb1e35abec0d8fde0b5336bf))

### Features

- **desktop-ui:** decouple reset.scss from all.scss ([e882221](https://github.com/deepkit/deepkit-framework/commit/e8822210b447b254ad28453082c33c4ffad419f2))

## [1.0.13](https://github.com/deepkit/deepkit-framework/compare/v1.0.12...v1.0.13) (2025-06-18)

### Bug Fixes

- **desktop-ui:** focusWatcher support for svg and other elements ([c54d118](https://github.com/deepkit/deepkit-framework/commit/c54d118172a076a0a5c35f97a77219906b5f7261))

## [1.0.12](https://github.com/deepkit/deepkit-framework/compare/v1.0.11...v1.0.12) (2025-06-05)

### Bug Fixes

- **bson:** ensure to seek over invalid elements in parser element lookup ([378a922](https://github.com/deepkit/deepkit-framework/commit/378a922c12cebdc93944a527892c33c79538f064))

## [1.0.11](https://github.com/deepkit/deepkit-framework/compare/v1.0.10...v1.0.11) (2025-06-02)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.9](https://github.com/deepkit/deepkit-framework/compare/v1.0.8...v1.0.9) (2025-05-23)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.8](https://github.com/deepkit/deepkit-framework/compare/v1.0.7...v1.0.8) (2025-05-20)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.5](https://github.com/deepkit/deepkit-framework/compare/v1.0.4...v1.0.5) (2025-04-02)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.3](https://github.com/deepkit/deepkit-framework/compare/v1.0.2...v1.0.3) (2025-03-13)

### Bug Fixes

- **desktop-ui:** adjust to new event api ([38ef6b8](https://github.com/deepkit/deepkit-framework/commit/38ef6b8250b8544f90588dd29306f2653eaa749e))
- **desktop-ui:** ng-packagr build and safari styling ([956ca9b](https://github.com/deepkit/deepkit-framework/commit/956ca9b7ff98e598c7ab9632eaf4303ef37070b7))

### Features

- **desktop-ui:** allow to pass ConnectedPosition strategy to dropdown component ([9ffd941](https://github.com/deepkit/deepkit-framework/commit/9ffd941092b347ed68108a758411edada20fff41))

## [1.0.2](https://github.com/deepkit/deepkit-framework/compare/v1.0.1...v1.0.2) (2025-02-24)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.160...v1.0.1) (2025-02-24)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.160](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.159...v1.0.1-alpha.160) (2025-02-18)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.158](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.157...v1.0.1-alpha.158) (2025-02-15)

### Bug Fixes

- **desktop-ui:** package scripts ([05e86f0](https://github.com/deepkit/deepkit-framework/commit/05e86f0a6ebbf77fcc293130489461482806a3e3))
- **desktop-ui:** package scripts ([4b64f7f](https://github.com/deepkit/deepkit-framework/commit/4b64f7ff84b801227df009c880b95da95e38f1f2))

## [1.0.1-alpha.157](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.156...v1.0.1-alpha.157) (2025-02-15)

### Bug Fixes

- tsconfig and tsc build ([ac71e83](https://github.com/deepkit/deepkit-framework/commit/ac71e838d542a3cab0e9b1cfc20b27637f1c01df))
- **type:** convert TypeAnnotation into intrinsic type ([#629](https://github.com/deepkit/deepkit-framework/issues/629)) ([4d1a13e](https://github.com/deepkit/deepkit-framework/commit/4d1a13ec11536e1951f5e348bd0b43b2244cccca)), closes [#626](https://github.com/deepkit/deepkit-framework/issues/626)

### Features

- update to angular 19 and typescript 5.7.3, new @deepkit/angular-ssr package ([#627](https://github.com/deepkit/deepkit-framework/issues/627)) ([52333a7](https://github.com/deepkit/deepkit-framework/commit/52333a71f98c7e25a74f048dd57f1efba61098f5))

## [1.0.1-alpha.156](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.155...v1.0.1-alpha.156) (2025-01-30)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.155](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.154...v1.0.1-alpha.155) (2024-10-30)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.154](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.153...v1.0.1-alpha.154) (2024-09-06)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.153](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.152...v1.0.1-alpha.153) (2024-06-06)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.151](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.150...v1.0.1-alpha.151) (2024-05-14)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.150](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.149...v1.0.1-alpha.150) (2024-05-09)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.149](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.148...v1.0.1-alpha.149) (2024-05-07)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.148](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.147...v1.0.1-alpha.148) (2024-05-04)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.147](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.146...v1.0.1-alpha.147) (2024-05-04)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.146](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.145...v1.0.1-alpha.146) (2024-04-17)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.145](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.144...v1.0.1-alpha.145) (2024-04-08)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.143](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.142...v1.0.1-alpha.143) (2024-03-17)

### Features

- **desktop-ui:** support queryParams in list route support ([6f33804](https://github.com/deepkit/deepkit-framework/commit/6f3380469c22d8c146367889c8afd55d8df15292))

## [1.0.1-alpha.142](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.141...v1.0.1-alpha.142) (2024-03-06)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.141](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.140...v1.0.1-alpha.141) (2024-03-05)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.140](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.139...v1.0.1-alpha.140) (2024-03-02)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.139](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.138...v1.0.1-alpha.139) (2024-02-29)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.138](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.137...v1.0.1-alpha.138) (2024-02-27)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.137](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.136...v1.0.1-alpha.137) (2024-02-26)

### Bug Fixes

- **desktop-ui:** correctly unregister destroyed sidebar ([8613ae4](https://github.com/deepkit/deepkit-framework/commit/8613ae495d9727df04a996dc5803d903b4a7b571))

## [1.0.1-alpha.136](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.135...v1.0.1-alpha.136) (2024-02-20)

### Bug Fixes

- **desktop-ui:** correctly publish package.json ([23f14ac](https://github.com/deepkit/deepkit-framework/commit/23f14aca049007bf18d16e2d4d6d01ca6079b5a4))

## [1.0.1-alpha.133](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.132...v1.0.1-alpha.133) (2024-02-15)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.132](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.131...v1.0.1-alpha.132) (2024-02-10)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.131](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.130...v1.0.1-alpha.131) (2024-02-09)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.128](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.127...v1.0.1-alpha.128) (2024-02-06)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.124](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.123...v1.0.1-alpha.124) (2024-02-04)

### Bug Fixes

- **desktop-ui:** -webkit-scrollbar is not supported in chrome anymore ([68fca4f](https://github.com/deepkit/deepkit-framework/commit/68fca4f393d170e2ce5b4bfa17539d06d6ab1cb0))
- **desktop-ui:** dont ignore dist/ in npm package ([e6e6faa](https://github.com/deepkit/deepkit-framework/commit/e6e6faa77f2e30d741dfe0bf77a0d79c5410a7dd))

## [1.0.1-alpha.123](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.122...v1.0.1-alpha.123) (2024-02-02)

### Bug Fixes

- **desktop-ui:** resolve various circular imports ([3f5c676](https://github.com/deepkit/deepkit-framework/commit/3f5c676f49678361707be5334222a08efdde65ba))

## [1.0.1-alpha.122](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.121...v1.0.1-alpha.122) (2024-01-31)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.121](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.120...v1.0.1-alpha.121) (2024-01-31)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.120](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.119...v1.0.1-alpha.120) (2024-01-29)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.119](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.118...v1.0.1-alpha.119) (2024-01-28)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.117](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.116...v1.0.1-alpha.117) (2024-01-26)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.116](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.115...v1.0.1-alpha.116) (2024-01-22)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.114](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.113...v1.0.1-alpha.114) (2024-01-21)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.113](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.112...v1.0.1-alpha.113) (2024-01-17)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.112](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.111...v1.0.1-alpha.112) (2024-01-16)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.111](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.110...v1.0.1-alpha.111) (2024-01-15)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.110](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.109...v1.0.1-alpha.110) (2024-01-11)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.109](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.108...v1.0.1-alpha.109) (2024-01-10)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.108](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.107...v1.0.1-alpha.108) (2023-11-21)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.106](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.105...v1.0.1-alpha.106) (2023-10-23)

**Note:** Version bump only for package @deepkit/desktop-ui

## [1.0.1-alpha.105](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.103...v1.0.1-alpha.105) (2023-10-23)

### Bug Fixes

- **type:** do not interfere with type checking when intersecting multiple type annotations. ([af85f1f](https://github.com/deepkit/deepkit-framework/commit/af85f1ff48c4be9fbd9a2ecd46e7f97b0bbb28c7))
