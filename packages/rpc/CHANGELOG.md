# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.0.19](https://github.com/deepkit/deepkit-framework/compare/v1.0.17...v1.0.19) (2025-09-22)

### Features

- **rpc:** allow configuring baseUrl callback in RpcHttpFetch ([2f0f55d](https://github.com/deepkit/deepkit-framework/commit/2f0f55d7eed69322e0e63da5ca2859173cdb7d04))

## [1.0.18](https://github.com/deepkit/deepkit-framework/compare/v1.0.17...v1.0.18) (2025-09-22)

### Features

- **rpc:** allow configuring baseUrl callback in RpcHttpFetch ([2f0f55d](https://github.com/deepkit/deepkit-framework/commit/2f0f55d7eed69322e0e63da5ca2859173cdb7d04))

## [1.0.15](https://github.com/deepkit/deepkit-framework/compare/v1.0.14...v1.0.15) (2025-06-26)

### Features

- **desktop-ui:** refactor to standalone/signal, update angular to v20, new website docs ([#657](https://github.com/deepkit/deepkit-framework/issues/657)) ([a39d26c](https://github.com/deepkit/deepkit-framework/commit/a39d26cd527947cb93c113434f1a29f4cc014d22))

## [1.0.12](https://github.com/deepkit/deepkit-framework/compare/v1.0.11...v1.0.12) (2025-06-05)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.11](https://github.com/deepkit/deepkit-framework/compare/v1.0.10...v1.0.11) (2025-06-02)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.10](https://github.com/deepkit/deepkit-framework/compare/v1.0.9...v1.0.10) (2025-05-24)

### Bug Fixes

- **rpc:** correctly unsubscribe Subject subscription created by action abstraction ([0e2424f](https://github.com/deepkit/deepkit-framework/commit/0e2424f7d5d2dc7b391748ca3af3016b4422006f))
- **rpc:** remove ObservableDisconnect and fix api-console-gui disconnecting observable ([a0cf750](https://github.com/deepkit/deepkit-framework/commit/a0cf7503558a1f2a4d6014b34cc01af70cea8c09))

### BREAKING CHANGES

- **rpc:** RPC will now longer call Subject.complete()/Subject.unsubscribe() on the Subject on the server when client does Subject.complete()/Subject.unsubscribe() or client disconnects. Instead, it just unsubscribes the single subscription created when the Subject is returned by the RPC controller. The Subject on the server can be monitored manually itself (by e.g. checking Subject.observed)
- **rpc:** Removed `disconnectObservable` as not needed anymore thanks to GC monitoring. Also, removed `instantObservable` (use defer() with switchMap() instead)

This allows to reuse now subjects that live longer than the rpc controller/connection.

## [1.0.9](https://github.com/deepkit/deepkit-framework/compare/v1.0.8...v1.0.9) (2025-05-23)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.8](https://github.com/deepkit/deepkit-framework/compare/v1.0.7...v1.0.8) (2025-05-20)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.7](https://github.com/deepkit/deepkit-framework/compare/v1.0.6...v1.0.7) (2025-04-18)

### Bug Fixes

- **rpc:** missing .js extension on imports ([d0380c9](https://github.com/deepkit/deepkit-framework/commit/d0380c9dc665f3dca5c7901b8ed16f2abb4d0f49))

## [1.0.6](https://github.com/deepkit/deepkit-framework/compare/v1.0.5...v1.0.6) (2025-04-03)

### Bug Fixes

- **rpc:** make sure client disconnect trigger transport disconnect ([89ae002](https://github.com/deepkit/deepkit-framework/commit/89ae002b693f52deb32dbd07db1025fc61a9d8ec))

## [1.0.5](https://github.com/deepkit/deepkit-framework/compare/v1.0.4...v1.0.5) (2025-04-02)

### Bug Fixes

- **type:** replace more Inject imports ([5a88760](https://github.com/deepkit/deepkit-framework/commit/5a88760d90533ef38bc73ba9ad9af17cc64c728f))

## [1.0.4](https://github.com/deepkit/deepkit-framework/compare/v1.0.3...v1.0.4) (2025-03-13)

### Bug Fixes

- **rpc:** export events ([829317c](https://github.com/deepkit/deepkit-framework/commit/829317c0e7ef2dfbabe7e844258b3c5cd8c8c7df))

## [1.0.3](https://github.com/deepkit/deepkit-framework/compare/v1.0.2...v1.0.3) (2025-03-13)

### Features

- **rpc:** add utility functions to create Subject/Observable synchronously from an RPC controller ([349668f](https://github.com/deepkit/deepkit-framework/commit/349668fe0d2586831fc21d4b0d130bd1b8a2ffbb))
- **rpc:** automatically garbage collect observables + new event system + stats collection ([d727232](https://github.com/deepkit/deepkit-framework/commit/d727232ca4b445a6bc82de8df31e25ba2d60d683))
- **rpc:** improve disconnect handling and cleaning up RpcMessageSubject correctly ([9d9e29a](https://github.com/deepkit/deepkit-framework/commit/9d9e29ad2bffa91751a78486fe031d9b8a8fecf7))
- **rpc:** improve performance by 25% ([f7e524f](https://github.com/deepkit/deepkit-framework/commit/f7e524fabafe1b54047a642744373a0db611ce93))

## [1.0.2](https://github.com/deepkit/deepkit-framework/compare/v1.0.1...v1.0.2) (2025-02-24)

### Features

- **rpc:** allow to register hooks for rpc kernel and actions ([cb0102b](https://github.com/deepkit/deepkit-framework/commit/cb0102bf51a0b508dbacbc5d6010fbed058f52cd))

## [1.0.1](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.160...v1.0.1) (2025-02-24)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.160](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.159...v1.0.1-alpha.160) (2025-02-18)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.158](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.157...v1.0.1-alpha.158) (2025-02-15)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.157](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.156...v1.0.1-alpha.157) (2025-02-15)

### Bug Fixes

- **rpc:** ensure message size is reset to 0 after reaching a buffer that is too small ([c78a2a2](https://github.com/deepkit/deepkit-framework/commit/c78a2a26b98384ae6d1e6b87aa993e77026f4e7c))
- tsconfig and tsc build ([ac71e83](https://github.com/deepkit/deepkit-framework/commit/ac71e838d542a3cab0e9b1cfc20b27637f1c01df))

### Features

- **rpc:** make binary parser more stable and throw better error message on decoding failure ([66e8f0d](https://github.com/deepkit/deepkit-framework/commit/66e8f0d196ed3f6c7ec2d7b4d106afb4e21d1d54))
- **rpc:** show invalid binary message in hex on error ([1a7bf16](https://github.com/deepkit/deepkit-framework/commit/1a7bf16a04282125fd3c5c0154bad39beaf8e14d))
- update to angular 19 and typescript 5.7.3, new @deepkit/angular-ssr package ([#627](https://github.com/deepkit/deepkit-framework/issues/627)) ([52333a7](https://github.com/deepkit/deepkit-framework/commit/52333a71f98c7e25a74f048dd57f1efba61098f5))

## [1.0.1-alpha.156](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.155...v1.0.1-alpha.156) (2025-01-30)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.155](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.154...v1.0.1-alpha.155) (2024-10-30)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.154](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.153...v1.0.1-alpha.154) (2024-09-06)

### Features

- **rpc:** make Buffer dependency optional ([2f32a12](https://github.com/deepkit/deepkit-framework/commit/2f32a1214c2c4555371fc1cfccdfdf533c21128e))

## [1.0.1-alpha.153](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.152...v1.0.1-alpha.153) (2024-06-06)

### Bug Fixes

- **rpc:** add interface for fetch ([6035736](https://github.com/deepkit/deepkit-framework/commit/60357366ec1db553789909889bf3489dea17a269))
- **rpc:** http adapter wrong authorization + remove OPTIONS method ([3ff8955](https://github.com/deepkit/deepkit-framework/commit/3ff89556961864ceffea188e33e0af0404cd44b3))
- **rpc:** make sure Error is chained and ValidationError correctly handled ([5c49778](https://github.com/deepkit/deepkit-framework/commit/5c49778da68baaab6e7d9588acb03af7d891bf3a))

### Features

- **rpc:** add http transport ([3b2c6cc](https://github.com/deepkit/deepkit-framework/commit/3b2c6cc6c75d70e3b6bfac7d53e3e7606696baf4))

## [1.0.1-alpha.152](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.151...v1.0.1-alpha.152) (2024-05-16)

### Features

- **rpc:** client.transporter.errored subject ([0fc2bd4](https://github.com/deepkit/deepkit-framework/commit/0fc2bd4aa904bdae9398f4e4c7db602afd3bcbc4))

## [1.0.1-alpha.151](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.150...v1.0.1-alpha.151) (2024-05-14)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.150](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.149...v1.0.1-alpha.150) (2024-05-09)

### Bug Fixes

- **rpc:** ensure data is not chunked twice in server->client controllers ([6c59f9b](https://github.com/deepkit/deepkit-framework/commit/6c59f9bda5830dc11f85b555e7ecd618e10708f8))

## [1.0.1-alpha.149](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.148...v1.0.1-alpha.149) (2024-05-07)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.148](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.147...v1.0.1-alpha.148) (2024-05-04)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.147](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.146...v1.0.1-alpha.147) (2024-05-04)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.146](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.145...v1.0.1-alpha.146) (2024-04-17)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.145](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.144...v1.0.1-alpha.145) (2024-04-08)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.143](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.142...v1.0.1-alpha.143) (2024-03-17)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.142](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.141...v1.0.1-alpha.142) (2024-03-06)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.141](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.140...v1.0.1-alpha.141) (2024-03-05)

### Bug Fixes

- **rpc:** maintain strictSerialization option also in new observables ([273330b](https://github.com/deepkit/deepkit-framework/commit/273330b102c30f62895bd7d3b8b6d6762e080740))

## [1.0.1-alpha.140](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.139...v1.0.1-alpha.140) (2024-03-02)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.139](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.138...v1.0.1-alpha.139) (2024-02-29)

### Bug Fixes

- **rpc:** only print warning text, not error ([ed8cfe7](https://github.com/deepkit/deepkit-framework/commit/ed8cfe7733a36b79a8802afec9280f74d51a6b1b))

## [1.0.1-alpha.138](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.137...v1.0.1-alpha.138) (2024-02-27)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.137](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.136...v1.0.1-alpha.137) (2024-02-26)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.135](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.134...v1.0.1-alpha.135) (2024-02-16)

### Features

- **rpc:** reuse type cache across connections + made strictSerialization(false) less strict ([1b55b08](https://github.com/deepkit/deepkit-framework/commit/1b55b085aee23a53070daa3d179cd86734608b57))

## [1.0.1-alpha.134](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.133...v1.0.1-alpha.134) (2024-02-15)

### Features

- **rpc:** allow to disable strict serialization and validation ([d7a8155](https://github.com/deepkit/deepkit-framework/commit/d7a8155328dca9dca16c3bea88794002fa6f5cba))
- **rpc:** use rpc.logValidationErrors also for strict serializer ([78f57e9](https://github.com/deepkit/deepkit-framework/commit/78f57e92dd457004644d2fa717e6550782a06d3c))

## [1.0.1-alpha.133](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.132...v1.0.1-alpha.133) (2024-02-15)

### Features

- **rpc:** allow serialization of unknown Observable type ([0014074](https://github.com/deepkit/deepkit-framework/commit/00140743b3cec674f7eda89a034c46720c5c96ae))

## [1.0.1-alpha.132](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.131...v1.0.1-alpha.132) (2024-02-10)

### Bug Fixes

- **rpc:** better error message when no observable type can be extracted ([5e7ecf1](https://github.com/deepkit/deepkit-framework/commit/5e7ecf12adf526b103757ede04ed7ec6923a7af6))

## [1.0.1-alpha.131](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.130...v1.0.1-alpha.131) (2024-02-09)

### Bug Fixes

- **rpc:** error Observable Subscribers when no Observable Next type can be detected ([e207fea](https://github.com/deepkit/deepkit-framework/commit/e207fea1d9abbb61f8e33d8253fe3ce5e23022d0))

## [1.0.1-alpha.128](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.127...v1.0.1-alpha.128) (2024-02-06)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.126](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.125...v1.0.1-alpha.126) (2024-02-06)

### Bug Fixes

- **rpc:** wrong ESM import ([1426627](https://github.com/deepkit/deepkit-framework/commit/14266273c30414513aed4ae7667697f19d852098))

## [1.0.1-alpha.124](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.123...v1.0.1-alpha.124) (2024-02-04)

### Bug Fixes

- **type:** handle more circular types ([5f6bd12](https://github.com/deepkit/deepkit-framework/commit/5f6bd124aaf9c546014b81dbded8110312f4e819)), closes [#477](https://github.com/deepkit/deepkit-framework/issues/477)

## [1.0.1-alpha.123](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.122...v1.0.1-alpha.123) (2024-02-02)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.122](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.121...v1.0.1-alpha.122) (2024-01-31)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.121](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.120...v1.0.1-alpha.121) (2024-01-31)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.120](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.119...v1.0.1-alpha.120) (2024-01-29)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.119](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.118...v1.0.1-alpha.119) (2024-01-28)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.117](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.116...v1.0.1-alpha.117) (2024-01-26)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.116](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.115...v1.0.1-alpha.116) (2024-01-22)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.114](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.113...v1.0.1-alpha.114) (2024-01-21)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.113](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.112...v1.0.1-alpha.113) (2024-01-17)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.112](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.111...v1.0.1-alpha.112) (2024-01-16)

### Features

- **rpc:** make kernel connection available in kernel security ([#536](https://github.com/deepkit/deepkit-framework/issues/536)) ([32252b0](https://github.com/deepkit/deepkit-framework/commit/32252b0c1327ec093215602c936d287c20f0a66e))

## [1.0.1-alpha.111](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.110...v1.0.1-alpha.111) (2024-01-15)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.110](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.109...v1.0.1-alpha.110) (2024-01-11)

**Note:** Version bump only for package @deepkit/rpc

## [1.0.1-alpha.109](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.108...v1.0.1-alpha.109) (2024-01-10)

### Bug Fixes

- **rpc:** defer resolving class name ([68fe2a9](https://github.com/deepkit/deepkit-framework/commit/68fe2a9e7bef13462bd304d0d4b55f3afec1b5db))
- **rpc:** tests with controller path resolution based on reflection ([6909fa8](https://github.com/deepkit/deepkit-framework/commit/6909fa846a7880feeecf0323e5e507ba8f929a72))

## [1.0.1-alpha.108](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.107...v1.0.1-alpha.108) (2023-11-21)

### Bug Fixes

- **rpc:** correctly load controller name ([9d603db](https://github.com/deepkit/deepkit-framework/commit/9d603dbf752cfe5335d2c89c4c785a23e8400e0e))
- **rpc:** race condition in disconnect() when connect is still in progress ([f2d708d](https://github.com/deepkit/deepkit-framework/commit/f2d708dfa0dbcfde218aaeea864eb323291ea45a))

### Features

- **rpc:** make controller decorator name optional ([#491](https://github.com/deepkit/deepkit-framework/issues/491)) ([525ed39](https://github.com/deepkit/deepkit-framework/commit/525ed39157334bab05c923fa9de6426d1c496d29))

## [1.0.1-alpha.105](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.103...v1.0.1-alpha.105) (2023-10-23)

### Bug Fixes

- **rpc:** move controllerAccess to handleAction to not call it twice. ([c68308d](https://github.com/deepkit/deepkit-framework/commit/c68308de9c28f8f72bc65c7e25fb08d6555f1383))
