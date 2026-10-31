# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.1.0](https://github.com/deepkit/deepkit-framework/compare/v1.0.19...v1.1.0) (2026-10-31)

### Bug Fixes

- **app,framework,api-console-module,orm-browser:** find GUI packages via module resolution ([e767a1e](https://github.com/deepkit/deepkit-framework/commit/e767a1efbaa8cefc8b1e06c7ace0e5c8c13d698b)), closes [#608](https://github.com/deepkit/deepkit-framework/issues/608)
- **app:** ensure already uppercased names stay the same ([afbf6e2](https://github.com/deepkit/deepkit-framework/commit/afbf6e228482d04413497e6a8f724ef40f1a201d))
- **app:** keep the default of flag properties when the flag is not given ([4764a5c](https://github.com/deepkit/deepkit-framework/commit/4764a5c8614a6bf4b5e0de5be0926eb90de3279a))
- **bson,type:** report the same union errors in BSON as in validate() ([35ce1f6](https://github.com/deepkit/deepkit-framework/commit/35ce1f6520b15d85f3050a941da271b4d9bb4e18))
- **bson:** ensure wrapped bson value is bson type null when null or undefined ([9af338e](https://github.com/deepkit/deepkit-framework/commit/9af338e0a5cac72bd4caede8829323e63e67a826)), closes [#678](https://github.com/deepkit/deepkit-framework/issues/678)
- **bson:** report errors of the closest union member on union mismatch ([#676](https://github.com/deepkit/deepkit-framework/issues/676)) ([bc146ee](https://github.com/deepkit/deepkit-framework/commit/bc146eed936143d2dea3b0bea011504e24f833eb))
- **bun:** apply compilerOptions, include and exclude of the plugin ([7fd19ac](https://github.com/deepkit/deepkit-framework/commit/7fd19acf82b746ef0451726b91805243d0a08471))
- **compiler:** module type for nodenext ([35ff3b9](https://github.com/deepkit/deepkit-framework/commit/35ff3b98c1e9ee79f25d8f5cbb09a6350f5e3045))
- **core,filesystem:** handle Windows paths in getCurrentDirName and the local adapter ([#688](https://github.com/deepkit/deepkit-framework/issues/688), [#694](https://github.com/deepkit/deepkit-framework/issues/694)) ([75816ef](https://github.com/deepkit/deepkit-framework/commit/75816effbee603e2d32aaa15137fbe12525b0fe8))
- **deps:** `@deepkit/*` peer dependencies require the current version ([#574](https://github.com/deepkit/deepkit-framework/issues/574)) ([ee7546f](https://github.com/deepkit/deepkit-framework/commit/ee7546f4416b66546e146591a45d39094f49c1c6))
- **deps:** build ESM before certified test runs, allow commits without source changes ([4195ea8](https://github.com/deepkit/deepkit-framework/commit/4195ea8f5e5bff4fa85f3d726ffe096e3836ce70))
- **deps:** commit dist/esm/package.json of all packages with an ESM build ([9dbdfcc](https://github.com/deepkit/deepkit-framework/commit/9dbdfcc62f498d095d4f16cfb653124488796557))
- **deps:** declare all @deepkit/\* packages that are imported ([ba76daa](https://github.com/deepkit/deepkit-framework/commit/ba76daacc071e489994a83d8a8aecefbec25d67b))
- **deps:** ignore jest warnings in the list of test files ([ce6bc7b](https://github.com/deepkit/deepkit-framework/commit/ce6bc7b35a7602f662ece0998c7b2a47663993dc))
- **deps:** name the test suites that did not run instead of comparing counts ([37cd679](https://github.com/deepkit/deepkit-framework/commit/37cd679e6e16ff0b8082738e2ecf14eb6bd299a2))
- **desktop-ui:** dropdown: re-observe position only when target changes ([758e8ba](https://github.com/deepkit/deepkit-framework/commit/758e8bada92c80fff63e34154e6a5835263b9e81))
- **desktop-ui:** format dates with LOCALE_ID and a 24-hour clock ([1f8cff6](https://github.com/deepkit/deepkit-framework/commit/1f8cff6536e9a21cdc9d320458d8c60d29883dec))
- **devtool:** exclude desktop-ui specs from the app build ([cffe3f3](https://github.com/deepkit/deepkit-framework/commit/cffe3f3471b6a1f5e437235c8afc599154880d5c))
- **event:** ensure dispatcher rebuild after context merge, add tests ([168a030](https://github.com/deepkit/deepkit-framework/commit/168a0301063f52555cd8b90bf603da0c6ea1e43c))
- **filesystem-aws-s3:** store keys without leading slash when path option is set ([9225f71](https://github.com/deepkit/deepkit-framework/commit/9225f710a346ec9532928f776a70cab2d8e3156d))
- **filesystem-ftp,filesystem-sftp:** report directory size 0 like the local adapter ([b0948b3](https://github.com/deepkit/deepkit-framework/commit/b0948b381b9404db9605547a240b77502f2cee0c))
- **framework:** do not hang the debug store when the broker is unreachable ([43f0144](https://github.com/deepkit/deepkit-framework/commit/43f014421e77abeaeb6d45595953a508f7ee00d6))
- **framework:** use an in-process broker for debug frames without workers ([eb3cad7](https://github.com/deepkit/deepkit-framework/commit/eb3cad7305757f9e6c534439011108f204e9afb0))
- **http:** don't reveal whether files outside of the static root exist ([52141c6](https://github.com/deepkit/deepkit-framework/commit/52141c6e8620a549c59d8d7f4765ce53be5f9aef))
- **http:** errors and timeouts of middlewares fail the request ([#439](https://github.com/deepkit/deepkit-framework/issues/439)) ([a953246](https://github.com/deepkit/deepkit-framework/commit/a95324651e4c242c509334ebfb31058fe187bb53))
- **http:** match header parameters case-insensitively ([#653](https://github.com/deepkit/deepkit-framework/issues/653)) ([beebd60](https://github.com/deepkit/deepkit-framework/commit/beebd60f1b3976afe5e5d2db940aa7a6cc80df2a))
- **http:** respond with the status code of an HttpError thrown in a middleware ([#589](https://github.com/deepkit/deepkit-framework/issues/589)) ([253fb8f](https://github.com/deepkit/deepkit-framework/commit/253fb8fb55d1d8dc25fc94e0619abd431303a546))
- **http:** trigger onResponse when a middleware ends the response ([#590](https://github.com/deepkit/deepkit-framework/issues/590)) ([7aa3d08](https://github.com/deepkit/deepkit-framework/commit/7aa3d084f1a57d5e4367d690713393909619c51e))
- **injector:** use the unscoped provider in scopes without their own provider ([dca8e69](https://github.com/deepkit/deepkit-framework/commit/dca8e69e242386e65b896ef7e0b89cbc2eb3518e))
- **mongo:** disable slow empty count with `estimateCount` option ([4b142c8](https://github.com/deepkit/deepkit-framework/commit/4b142c845ec86a4a1007eedc723be93902bd38d2))
- **mongo:** ensure correct cursor id as bigint, ensure batchSize is used ([0dd646a](https://github.com/deepkit/deepkit-framework/commit/0dd646a2e9b62ff7e0e82662b29d6fa79da923ab))
- **mongo:** read an aggregate's cursor id as bigint ([4c67a33](https://github.com/deepkit/deepkit-framework/commit/4c67a332dd6909a9b75836a9bce5507ba9e5d74c))
- **mongo:** slow empty count, remove verbose logs ([1be535f](https://github.com/deepkit/deepkit-framework/commit/1be535f56e2d33cb29261709d6ac8b03cb49d677))
- **mongo:** the heartbeat stopped for good when its timer fired a millisecond early ([701b5d0](https://github.com/deepkit/deepkit-framework/commit/701b5d04cba46b5a9d45afa46ff467d8728888d7))
- **orm-browser:** render array content, and disable editing ([06d058d](https://github.com/deepkit/deepkit-framework/commit/06d058d92b37598c7b7ad7767aee84575c949cd0))
- **orm-browser:** show the app's databases when forDatabases() is not used ([f848e4f](https://github.com/deepkit/deepkit-framework/commit/f848e4fe2d309d84e53c36ee5ba13f0384a71e58))
- **orm,mongo:** a filter field set to undefined no longer matches everything ([#692](https://github.com/deepkit/deepkit-framework/issues/692)) ([1b945c7](https://github.com/deepkit/deepkit-framework/commit/1b945c7f4398c520c4acab9db5673efc22fd9e0a))
- **orm:** count() ignores pagination and sort of the query ([#668](https://github.com/deepkit/deepkit-framework/issues/668)) ([1ba444a](https://github.com/deepkit/deepkit-framework/commit/1ba444a1516378bc53a9ae95b5bd12df8108e4f6))
- **orm:** do not skip all other uow listeners if first event has default prevented ([#670](https://github.com/deepkit/deepkit-framework/issues/670)) ([2796bb1](https://github.com/deepkit/deepkit-framework/commit/2796bb1409fced310febebc6c0b324dc0027f2ff))
- **orm:** hydrate known references when the full entity is loaded ([#636](https://github.com/deepkit/deepkit-framework/issues/636)) ([32f05c8](https://github.com/deepkit/deepkit-framework/commit/32f05c8ce4e2b17ea1bb6a4862df44d8d63626a2))
- **orm:** joined back references of a reference upgraded to a full entity ([61ede01](https://github.com/deepkit/deepkit-framework/commit/61ede01c6b3dbc3bb6d6212a81ddfd99568168b8)), closes [#636](https://github.com/deepkit/deepkit-framework/issues/636)
- **orm:** merge event listeners to prevent loosing them when setting to a different dispatcher instance ([#671](https://github.com/deepkit/deepkit-framework/issues/671)) ([f3c9683](https://github.com/deepkit/deepkit-framework/commit/f3c96834ed2121cca6152d138f8a01d33817a9fd))
- **orm:** return soft delete query results to be consistent with normal query operation results ([#672](https://github.com/deepkit/deepkit-framework/issues/672)) ([ef7bb9f](https://github.com/deepkit/deepkit-framework/commit/ef7bb9fa936aee424aa9032cdcef38c8e21d03f1))
- **rpc:** keep subscribed observables and subjects alive until they complete ([6243c3e](https://github.com/deepkit/deepkit-framework/commit/6243c3ef712c8787f564cff99c0c9a654538b928))
- **rpc:** normalize stopwatch frame names ([26a06cd](https://github.com/deepkit/deepkit-framework/commit/26a06cd15d5b23423d5dc6504d5f4a87cce20a77))
- **rpc:** reject messages sent while the server is unreachable ([1bb0bf9](https://github.com/deepkit/deepkit-framework/commit/1bb0bf955825b651c85f1db432d12815184a0af4))
- **rpc:** reject PreSerialized values in messages that cannot splice them ([1799053](https://github.com/deepkit/deepkit-framework/commit/17990539a1d1ce64a5a942ceb0934dfea4690d0f))
- **rpc:** stop a replaced socket from stranding calls on the new connection ([2de8673](https://github.com/deepkit/deepkit-framework/commit/2de8673fa0525e2170e94b77cb4c23db618cd059))
- **sql,desktop-ui:** add the missing shebang to the bin scripts ([#598](https://github.com/deepkit/deepkit-framework/issues/598)) ([beb019e](https://github.com/deepkit/deepkit-framework/commit/beb019e71a3826738e75beffe22a5a48e88e49d4))
- **sql,postgres,sqlite:** parse column defaults instead of eval() ([f0661ec](https://github.com/deepkit/deepkit-framework/commit/f0661ec7121fb4a0c0b58341cb20eb8ba9eaeb68))
- **sql:** bring back --path for the standalone migration commands ([849ef19](https://github.com/deepkit/deepkit-framework/commit/849ef19a95b0612668a1b4a43e5e9f0dfdbe07b9)), closes [#613](https://github.com/deepkit/deepkit-framework/issues/613)
- **sql:** create all tables before adding foreign keys in database.migrate() ([1ae363e](https://github.com/deepkit/deepkit-framework/commit/1ae363e33cf9ba018d38e38f08c3de0b4d20087d))
- **sqlite:** update better-sqlite3 to 12.11 for Node.js 26 support ([e6ad1fb](https://github.com/deepkit/deepkit-framework/commit/e6ad1fbe5f17483e79259f6a8953743e0d57ae43))
- **sqlite:** validate maxConnections of the connection pool ([dab7244](https://github.com/deepkit/deepkit-framework/commit/dab7244288100b83bf94f140afed295034b59343)), closes [#393](https://github.com/deepkit/deepkit-framework/issues/393)
- **sql:** use dynamic import instead of require to fix command execution in esm environments ([2c5766a](https://github.com/deepkit/deepkit-framework/commit/2c5766a78ef44d77f7bb6be3080bda5e6a1e4d3a))
- **template,mongo,http,framework:** make the ESM builds loadable ([814ca04](https://github.com/deepkit/deepkit-framework/commit/814ca04b36765b7c62b79c787e84b86582ebca63))
- **template:** ship the JSX types in the published jsx-runtime ([d8b829b](https://github.com/deepkit/deepkit-framework/commit/d8b829bfdd97507901f158568ec8b336a320439b))
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
- **type,bson:** name the received type in union and literal errors ([55bc216](https://github.com/deepkit/deepkit-framework/commit/55bc216e325fc8754e68adfe6ac4bd7addc30fdc))
- **type,orm,mongo,http,framework:** overridden references, optional Embedded, Mongo dot paths ([#704](https://github.com/deepkit/deepkit-framework/issues/704), [#254](https://github.com/deepkit/deepkit-framework/issues/254), [#697](https://github.com/deepkit/deepkit-framework/issues/697)) ([4a8a7a4](https://github.com/deepkit/deepkit-framework/commit/4a8a7a4b859024047dc86e5c9c941c17ae992bc9)), closes [#439](https://github.com/deepkit/deepkit-framework/issues/439) [#591](https://github.com/deepkit/deepkit-framework/issues/591) [#346](https://github.com/deepkit/deepkit-framework/issues/346) [#430](https://github.com/deepkit/deepkit-framework/issues/430) [#444](https://github.com/deepkit/deepkit-framework/issues/444) [#375](https://github.com/deepkit/deepkit-framework/issues/375)
- **type,type-compiler,bson:** useful union errors, default and aliased imports of library types ([97074f8](https://github.com/deepkit/deepkit-framework/commit/97074f859b9f2d377b3c3ba7bdd91820670a92b5)), closes [#577](https://github.com/deepkit/deepkit-framework/issues/577) [#676](https://github.com/deepkit/deepkit-framework/issues/676) [#601](https://github.com/deepkit/deepkit-framework/issues/601)
- **type:** a tuple only extends an array if all its elements do ([11a70ee](https://github.com/deepkit/deepkit-framework/commit/11a70ee8af7ac5d43e89f1aa12273ee331c83ddf))
- **type:** check large literal unions with a single lookup ([#478](https://github.com/deepkit/deepkit-framework/issues/478)) ([543e189](https://github.com/deepkit/deepkit-framework/commit/543e189635835745f4e8dbcbb80faa1bd68d5c15))
- **type:** check that UUID values are valid UUIDs ([79a865e](https://github.com/deepkit/deepkit-framework/commit/79a865e9b323e443fe8d0f945af86a0eb2f390d6))
- **type:** deserialized classes with a superClass are reflectable again ([#241](https://github.com/deepkit/deepkit-framework/issues/241)) ([b86d3d2](https://github.com/deepkit/deepkit-framework/commit/b86d3d294595abf4caff2ac670ef5cfc92ab7519))
- **type:** don't crash ValidationErrorItem.toString on circular values ([#505](https://github.com/deepkit/deepkit-framework/issues/505)) ([70ae003](https://github.com/deepkit/deepkit-framework/commit/70ae003a69f354c378394d99d90b22e5aea54f14))
- **type:** explain how to fix missing runtime type errors ([#562](https://github.com/deepkit/deepkit-framework/issues/562), [#508](https://github.com/deepkit/deepkit-framework/issues/508)) ([8722519](https://github.com/deepkit/deepkit-framework/commit/87225195fc8bbfdd99ce19a4428971f5b1f91e4c))
- **type:** fix type collapse when B resolves to unknown ([1130ddd](https://github.com/deepkit/deepkit-framework/commit/1130dddc996f85c9102c9fe4d52feb258ac0d3e4))
- **type:** infer tuple elements after a rest element from the end ([#524](https://github.com/deepkit/deepkit-framework/issues/524)) ([7483886](https://github.com/deepkit/deepkit-framework/commit/7483886311ef23df9be935581c5e78ff04850d34))
- **type:** large literal unions keep applying template hooks ([#478](https://github.com/deepkit/deepkit-framework/issues/478)) ([ae2790e](https://github.com/deepkit/deepkit-framework/commit/ae2790ea49faf04953ce6c38fe4cc1819303eb35))
- **type:** remove the uuid and buffer dependencies ([#705](https://github.com/deepkit/deepkit-framework/issues/705), [#699](https://github.com/deepkit/deepkit-framework/issues/699)) ([9036b3b](https://github.com/deepkit/deepkit-framework/commit/9036b3bba0f28ff619e8139342b2c7f5f4a66d5a))
- **type:** report errors of the closest union member ([#577](https://github.com/deepkit/deepkit-framework/issues/577), [#676](https://github.com/deepkit/deepkit-framework/issues/676)) ([840b9eb](https://github.com/deepkit/deepkit-framework/commit/840b9ebc086671fef03e17691b4178b0a2080b68))
- **type:** treat `new X` without parentheses as a computed default value ([82a2455](https://github.com/deepkit/deepkit-framework/commit/82a2455fb059ec8c3c2519e91936905bea866faa)), closes [#545](https://github.com/deepkit/deepkit-framework/issues/545)
- **vite,type-compiler:** accept FilterPattern for include and exclude ([#696](https://github.com/deepkit/deepkit-framework/issues/696)) ([c1bcfda](https://github.com/deepkit/deepkit-framework/commit/c1bcfdadccc97859db16b0d55f2ab07933dee0b9))
- **website:** allow the deepkit.io hosts for server-side rendering ([5717a86](https://github.com/deepkit/deepkit-framework/commit/5717a867a5910738a38c15e746a6ff063d311218))
- **website:** better font styling, default dark ([40aab6b](https://github.com/deepkit/deepkit-framework/commit/40aab6baafd7c29c18dac2ec470ef24a8d814ccb))
- **website:** broken links in the documentation ([ae434d8](https://github.com/deepkit/deepkit-framework/commit/ae434d8a609fe9680109a682fe56061cf20c31a9))
- **website:** build the Docker image on Node 24.22.1 ([0a2b360](https://github.com/deepkit/deepkit-framework/commit/0a2b36029d504744ebaa469d74c4703c4316a8ff))
- **website:** build the Docker image with the committed tsconfigs ([2e13ccb](https://github.com/deepkit/deepkit-framework/commit/2e13ccbb55475e66ce65c8e4880dfc3fa1d38938))
- **website:** complete the removal of /benchmark/add, admins only from the command line, random session tokens ([76d40a1](https://github.com/deepkit/deepkit-framework/commit/76d40a191bf2423e8278cb3da710d3fbb11fb642))
- **website:** copy scripts/ into the Docker build, npm run build ends with the build stamp ([8b8d92a](https://github.com/deepkit/deepkit-framework/commit/8b8d92ac7d3309e0b1847bb94913faa4e0413114))
- **website:** copy tsconfig.base.json into the Docker build ([79c4d69](https://github.com/deepkit/deepkit-framework/commit/79c4d698213cb9a170c92988fd0880a7ec656b14))
- **website:** drop the votes of the community questions before the questions ([f705c83](https://github.com/deepkit/deepkit-framework/commit/f705c836b6217e09f81a93ad07c935b8b8804d24))
- **website:** pages revalidate after deploys, Desktop UI pages declared as English, no missing manifest ([7bd8b79](https://github.com/deepkit/deepkit-framework/commit/7bd8b798fcdd72dd0e410f81d93bc50f85f27ead))
- **website:** permanent redirects, hreflang and canonical URLs, sitemap; remove questions and examples ([d0becd8](https://github.com/deepkit/deepkit-framework/commit/d0becd89d2f2a2fdb131d65c9e6825037af2a5ba))
- **website:** remove /benchmark/add, admins only from the command line, random session tokens ([97d8248](https://github.com/deepkit/deepkit-framework/commit/97d824867b45288d9518a96cfa8ffd31103a6255))
- **website:** run commands like migrate instead of starting the server ([0d7f616](https://github.com/deepkit/deepkit-framework/commit/0d7f61610faddd4c6c7d7e8dabe994d4181b66b9))
- **website:** satori and resvg as dependencies, the Docker image installs only those ([c0e895c](https://github.com/deepkit/deepkit-framework/commit/c0e895c26afe99b9cf9d4bf15e783e585dc67c1a))
- **website:** use getMimeType of `@deepkit/http` instead of mime-types ([dc2ed51](https://github.com/deepkit/deepkit-framework/commit/dc2ed51875cba0c0972357d7d7ae6b6922a924e8))
- wrong InjectorContext scope set in HTTP, and wrong received in RPC ([#673](https://github.com/deepkit/deepkit-framework/issues/673)) ([a56b7dd](https://github.com/deepkit/deepkit-framework/commit/a56b7ddbaa50cdb901bb453ae10f867d4b86f563))

### Features

- **bench,website:** record the versions of the compared libraries and show them next to their results ([6f98b62](https://github.com/deepkit/deepkit-framework/commit/6f98b62462eda44b381e4e14884f4e066562bff6))
- **bench:** benchmarks for all core packages, comparisons and a runner that tracks results ([b5abf6f](https://github.com/deepkit/deepkit-framework/commit/b5abf6f7139b7c31dd4997b7a1d084a1348c8136))
- **bench:** filtered runs update their files in an existing result ([710602b](https://github.com/deepkit/deepkit-framework/commit/710602b4f3dec5a9e4e476778d22e9b7e1db176e))
- enable isolatedModules ([#683](https://github.com/deepkit/deepkit-framework/issues/683)) ([c730cfc](https://github.com/deepkit/deepkit-framework/commit/c730cfcfadc898f632b3c64b90ca57fa6764af32))
- **rpc:** send one value to many connections without serializing it each time ([43ecb1e](https://github.com/deepkit/deepkit-framework/commit/43ecb1ed0a938d2637941121b83788836c03481b))
- **type:** scored union resolver ([a1f8ee3](https://github.com/deepkit/deepkit-framework/commit/a1f8ee3a345c696e341e37bc26065b97157392fe))
- **type:** support intrinsics Capitalize, Uppercase, Lowercase, Uncapitalize ([#681](https://github.com/deepkit/deepkit-framework/issues/681)) ([ffd1bc7](https://github.com/deepkit/deepkit-framework/commit/ffd1bc7b55cf08ce23be440bab33dd6925299d1c))
- **website,http:** benchmarks over time, complete HTTP requests as benchmark ([add08b7](https://github.com/deepkit/deepkit-framework/commit/add08b7538beb44f75fc3147edd21b591b857061))
- **website:** benchmarks page from the committed results ([57c2f89](https://github.com/deepkit/deepkit-framework/commit/57c2f894c253329f399c3bddbbe1828e40a7d7be))
- **website:** bring back the translate command with OpenAI gpt-6.1-sol ([9df1f68](https://github.com/deepkit/deepkit-framework/commit/9df1f68a25612e728e7701bc2643add875beb22b))
- **website:** database benchmarks, three versions with per-column factors ([f646d8c](https://github.com/deepkit/deepkit-framework/commit/f646d8cf08312e88a3bc544cce59949dc4fd347b))
- **website:** discord and npm badges on the start page ([b02a803](https://github.com/deepkit/deepkit-framework/commit/b02a803d6b4ca2854f6ce3fe77be4709bc7d6578))
- **website:** documentation for LLMs and coding agents (llms.txt) ([f59fb57](https://github.com/deepkit/deepkit-framework/commit/f59fb577e439b22f03b4b85e4625f20cdec6847b))
- **website:** generate the desktop-ui API tables with api-docs.ts ([a95d1a7](https://github.com/deepkit/deepkit-framework/commit/a95d1a70e6e494ffa45abd56bef53f57363e902e))
- **website:** generated social preview images for all pages ([e385fb9](https://github.com/deepkit/deepkit-framework/commit/e385fb941316f4cf369d04fbf0bb4bde7d9df32f))
- **website:** link llms-full.txt right after the summary of llms.txt and on the start page ([751cede](https://github.com/deepkit/deepkit-framework/commit/751cede0672560fb416908c864623d322663100d))
- **website:** new start page with runtime types, benchmarks and explained library catalog ([b7abb7c](https://github.com/deepkit/deepkit-framework/commit/b7abb7c70d1f501fcebca7a01f0b4acfae1de9b6))
- **website:** redirects for the remaining old documentation URLs, structured data for search engines ([5f017d1](https://github.com/deepkit/deepkit-framework/commit/5f017d1b6da1199dde60088302f92d8a17f8c0ca))

### Performance Improvements

- **desktop-ui:** only emit runtime types where desktop-ui and ui-library use them ([5288594](https://github.com/deepkit/deepkit-framework/commit/52885946373281e61d5dd9de181877e09626c749))
- **injector:** compute a token's type and a config type's place once ([8b37311](https://github.com/deepkit/deepkit-framework/commit/8b37311f78e3eada617875ced42f154d79287700))
- **logger:** return single-string messages without util.format ([f397091](https://github.com/deepkit/deepkit-framework/commit/f3970915ea86fe12972836d144fbaae8f8b3e792))
- **type,http:** fast discriminated unions, no scoring outside unions, flat query strings ([d5ce462](https://github.com/deepkit/deepkit-framework/commit/d5ce4629c290722b4af76a356c70f53d645fd302))
- **type,type-compiler,core:** faster type guards, type arguments and serializer calls ([c39c8fd](https://github.com/deepkit/deepkit-framework/commit/c39c8fd8838fa205400507ba0146918333186044)), closes [#568](https://github.com/deepkit/deepkit-framework/issues/568)
- **type:** check plain objects in the generated type guard, not in isObjectLiteral ([b7012e2](https://github.com/deepkit/deepkit-framework/commit/b7012e2589f942395a2ddad8006e0edf4855a33c))
- **type:** inline the guards of anonymous object literals and arrays of primitives ([7ce005a](https://github.com/deepkit/deepkit-framework/commit/7ce005a4fc7af3c2bd5f23bf8119adffaf7d5d0d))

### BREAKING CHANGES

- const enums converted to regular enums in:
  - MappedModifier (type-spec)
  - BinaryBigIntType (type)
  - BrokerType (broker)
  - RpcMessageRouteType (rpc)
  - AuthMechanism (mongo)

## [1.0.19](https://github.com/deepkit/deepkit-framework/compare/v1.0.17...v1.0.19) (2025-09-22)

### Bug Fixes

- **create-app:** correct file path for client-rpc npm script in create-app ([#659](https://github.com/deepkit/deepkit-framework/issues/659)) ([50a665f](https://github.com/deepkit/deepkit-framework/commit/50a665f31b97554dca1ad4d7d6fe061623c162ca))
- **mongo:** stop printing verbose stuff in mongosh ([d579a5a](https://github.com/deepkit/deepkit-framework/commit/d579a5ab582ebb154056945f9d5ca86e71cb6781))
- **type-compiler:** ensure typed imports are grouped and not too high up, but placed right in front of the origin import ([9f666c1](https://github.com/deepkit/deepkit-framework/commit/9f666c104bb38abc4396c99e281fd6605a9e2884))
- **website:** blog post url ([a84a272](https://github.com/deepkit/deepkit-framework/commit/a84a2723a61c99f7db3c8521e9cf793134e0be20))
- **website:** bullet/code/codeBlock + toc on blog posts ([c11bb27](https://github.com/deepkit/deepkit-framework/commit/c11bb27d5cc656545c02ddf7b42666376e32a32e))
- **website:** docs ([e098f57](https://github.com/deepkit/deepkit-framework/commit/e098f575c42a2c67fc7a1452d2108c817abc95bc))
- **website:** hotkeys help in admin text editor + render links/code/u/s/i marks ([293bbb7](https://github.com/deepkit/deepkit-framework/commit/293bbb7890994ed222498b42fe094e0d093a175f))
- **website:** resolving paths in prod build ([877698f](https://github.com/deepkit/deepkit-framework/commit/877698f8a2bddc1e955c5d0ca53d8819d0bd56a9))
- **website:** translation urls ([f1ef954](https://github.com/deepkit/deepkit-framework/commit/f1ef9542204533afd653a37c808ce6e6750a9685))
- **workflow:** ensure stopwatch context is correctly set and tracked ([b9e528c](https://github.com/deepkit/deepkit-framework/commit/b9e528c7c0baba6da879c83652e355480e64fbaf))
- **workflow:** make stopwatch required, normalize frame name ([0168db0](https://github.com/deepkit/deepkit-framework/commit/0168db0e3510227209854c48c29c28b2e51d0895))

### Features

- **rpc:** allow configuring baseUrl callback in RpcHttpFetch ([2f0f55d](https://github.com/deepkit/deepkit-framework/commit/2f0f55d7eed69322e0e63da5ca2859173cdb7d04))
- **website:** add translations (chinese, korean, japanese, german) ([4ab7058](https://github.com/deepkit/deepkit-framework/commit/4ab7058edd72a376f856c617a7f8ee243c82cd8b))
- **website:** page SSR and better responsive design for mobile ([586f2a5](https://github.com/deepkit/deepkit-framework/commit/586f2a542338375dc331005bf7586afe9a5383bf))

## [1.0.18](https://github.com/deepkit/deepkit-framework/compare/v1.0.17...v1.0.18) (2025-09-22)

### Bug Fixes

- **create-app:** correct file path for client-rpc npm script in create-app ([#659](https://github.com/deepkit/deepkit-framework/issues/659)) ([50a665f](https://github.com/deepkit/deepkit-framework/commit/50a665f31b97554dca1ad4d7d6fe061623c162ca))
- **mongo:** stop printing verbose stuff in mongosh ([d579a5a](https://github.com/deepkit/deepkit-framework/commit/d579a5ab582ebb154056945f9d5ca86e71cb6781))
- **type-compiler:** ensure typed imports are grouped and not too high up, but placed right in front of the origin import ([9f666c1](https://github.com/deepkit/deepkit-framework/commit/9f666c104bb38abc4396c99e281fd6605a9e2884))
- **website:** blog post url ([a84a272](https://github.com/deepkit/deepkit-framework/commit/a84a2723a61c99f7db3c8521e9cf793134e0be20))
- **website:** bullet/code/codeBlock + toc on blog posts ([c11bb27](https://github.com/deepkit/deepkit-framework/commit/c11bb27d5cc656545c02ddf7b42666376e32a32e))
- **website:** docs ([e098f57](https://github.com/deepkit/deepkit-framework/commit/e098f575c42a2c67fc7a1452d2108c817abc95bc))
- **website:** hotkeys help in admin text editor + render links/code/u/s/i marks ([293bbb7](https://github.com/deepkit/deepkit-framework/commit/293bbb7890994ed222498b42fe094e0d093a175f))
- **website:** resolving paths in prod build ([877698f](https://github.com/deepkit/deepkit-framework/commit/877698f8a2bddc1e955c5d0ca53d8819d0bd56a9))
- **website:** translation urls ([f1ef954](https://github.com/deepkit/deepkit-framework/commit/f1ef9542204533afd653a37c808ce6e6750a9685))
- **workflow:** ensure stopwatch context is correctly set and tracked ([b9e528c](https://github.com/deepkit/deepkit-framework/commit/b9e528c7c0baba6da879c83652e355480e64fbaf))
- **workflow:** make stopwatch required, normalize frame name ([0168db0](https://github.com/deepkit/deepkit-framework/commit/0168db0e3510227209854c48c29c28b2e51d0895))

### Features

- **rpc:** allow configuring baseUrl callback in RpcHttpFetch ([2f0f55d](https://github.com/deepkit/deepkit-framework/commit/2f0f55d7eed69322e0e63da5ca2859173cdb7d04))
- **website:** add translations (chinese, korean, japanese, german) ([4ab7058](https://github.com/deepkit/deepkit-framework/commit/4ab7058edd72a376f856c617a7f8ee243c82cd8b))
- **website:** page SSR and better responsive design for mobile ([586f2a5](https://github.com/deepkit/deepkit-framework/commit/586f2a542338375dc331005bf7586afe9a5383bf))

## [1.0.17](https://github.com/deepkit/deepkit-framework/compare/v1.0.16...v1.0.17) (2025-07-03)

### Bug Fixes

- **framework-debug-gui:** adjust to new desktop-ui output rowDblClick ([8710039](https://github.com/deepkit/deepkit-framework/commit/87100391f11945485978985f7e4520c994efd048))
- **mongo:** don't throw when index already exists ([6a4e194](https://github.com/deepkit/deepkit-framework/commit/6a4e19474aac20f66c140470796eaf38e402906e))
- **website:** docs ([807120a](https://github.com/deepkit/deepkit-framework/commit/807120a3a9a967f6aaa5a99782e7d6a33955b097))

### Features

- **desktop-ui:** table performance improvement, decouple styles from body, improve ProgressIndicatorComponent ([5333fe6](https://github.com/deepkit/deepkit-framework/commit/5333fe6cf6a46f3c5e272df53b403c943d7c7076))

## [1.0.16](https://github.com/deepkit/deepkit-framework/compare/v1.0.15...v1.0.16) (2025-06-30)

### Bug Fixes

- **desktop-ui:** fix icon font in webkit ([87e60b5](https://github.com/deepkit/deepkit-framework/commit/87e60b525eba6b553f068b97ff97aabe424a6662))
- **desktop-ui:** remove AbortController for addEventListener since bad browser support ([a35ffe1](https://github.com/deepkit/deepkit-framework/commit/a35ffe1fc40675a4c0ea7c163f06de8fc450ce5e))
- **website:** adaptive container example ([0538b00](https://github.com/deepkit/deepkit-framework/commit/0538b004ddb6620135bcf412a82d967ef7661c30))

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
- **example-server:** ensure typescript is a dep ([309819f](https://github.com/deepkit/deepkit-framework/commit/309819f162cc8dd533689498e8ca8b083c7232e1))
- **website:** hook router into dynamic anchors, fix SSR code highlighting ([2b5e2cf](https://github.com/deepkit/deepkit-framework/commit/2b5e2cfc0038f9ba55f2b22509dedb46850dc617))
- **website:** splitter example code ([4eb173b](https://github.com/deepkit/deepkit-framework/commit/4eb173b099ba102fc816e3d84dbe11ced49ee46b))

### Features

- **desktop-ui:** refactor to standalone/signal, update angular to v20, new website docs ([#657](https://github.com/deepkit/deepkit-framework/issues/657)) ([a39d26c](https://github.com/deepkit/deepkit-framework/commit/a39d26cd527947cb93c113434f1a29f4cc014d22))

## [1.0.14](https://github.com/deepkit/deepkit-framework/compare/v1.0.13...v1.0.14) (2025-06-22)

### Bug Fixes

- **desktop-ui:** dui-table[autoHeight] width correct styling and behaviour ([d541724](https://github.com/deepkit/deepkit-framework/commit/d541724c4417153bb4c6a59cc113d33e20d1e3e5))
- **desktop-ui:** make sure focusWatcher always closes ([d06ebb5](https://github.com/deepkit/deepkit-framework/commit/d06ebb5ec9478bdf91e1c67eeac2506f9bdc6700))
- **desktop-ui:** more fallback positions for dropdown ([74581eb](https://github.com/deepkit/deepkit-framework/commit/74581eb3add46059ac2bd67733b55e94fd7994e5))
- **desktop-ui:** resource leak of embedded view refs of dropdown/dialog ([7867335](https://github.com/deepkit/deepkit-framework/commit/78673352227a9b8ecb1e35abec0d8fde0b5336bf))
- **framework-debug-gui:** rename file, remove resize of textarea ([b21c921](https://github.com/deepkit/deepkit-framework/commit/b21c9213ffb0981cd069da0b47780b57ef803755))
- **framework:** correctly read media preview data ([359822c](https://github.com/deepkit/deepkit-framework/commit/359822c1ebc9ca23997e1ec2d133cc4805e38c56))

### Features

- **desktop-ui:** decouple reset.scss from all.scss ([e882221](https://github.com/deepkit/deepkit-framework/commit/e8822210b447b254ad28453082c33c4ffad419f2))
- **mongo:** explain() and allowDiskUse on aggregations ([cefcd96](https://github.com/deepkit/deepkit-framework/commit/cefcd96ce3cbc10d7c521edc0bf6e03aef85759e))
- **mongo:** implement Query.logExplain, to log the explain() query on next operation ([aae9a64](https://github.com/deepkit/deepkit-framework/commit/aae9a642da141495eb83c9334bafb9d890051601))
- **mongo:** support collation/hint option and new explain() API ([77dfde8](https://github.com/deepkit/deepkit-framework/commit/77dfde8d0f39b9a35af28a886b97e5cf5dce9341))
- **orm:** add explain() API ([c34370a](https://github.com/deepkit/deepkit-framework/commit/c34370aa7da1ee4d5ca9f7e3ff8ad240fc7aa999))

## [1.0.13](https://github.com/deepkit/deepkit-framework/compare/v1.0.12...v1.0.13) (2025-06-18)

### Bug Fixes

- **desktop-ui:** focusWatcher support for svg and other elements ([c54d118](https://github.com/deepkit/deepkit-framework/commit/c54d118172a076a0a5c35f97a77219906b5f7261))

### Features

- **website:** add api reference link ([ff44560](https://github.com/deepkit/deepkit-framework/commit/ff44560c4837072314e4695cd81286749c4b6256))

## [1.0.12](https://github.com/deepkit/deepkit-framework/compare/v1.0.11...v1.0.12) (2025-06-05)

### Bug Fixes

- **bson:** ensure to seek over invalid elements in parser element lookup ([378a922](https://github.com/deepkit/deepkit-framework/commit/378a922c12cebdc93944a527892c33c79538f064))

### Features

- **app:** infer AppModule config from extend expression, make sure to unsubscribe unhandledRejection when command is done ([c81841b](https://github.com/deepkit/deepkit-framework/commit/c81841beb0df2710a13acf6922d65bc63057b5ca))

## [1.0.11](https://github.com/deepkit/deepkit-framework/compare/v1.0.10...v1.0.11) (2025-06-02)

### Bug Fixes

- **broker:** issue with wrongly intercepting Subject next and publish ([b82b334](https://github.com/deepkit/deepkit-framework/commit/b82b334e50e7e67cf25edd51f05c5f9a313dcf89))
- **injector:** ensure transient context is reset to previous one to maintain old state ([822314d](https://github.com/deepkit/deepkit-framework/commit/822314d873e5df0a67658a0fc4d6662026405da8)), closes [#651](https://github.com/deepkit/deepkit-framework/issues/651)
- **injector:** make sure Inject<T> providers are not injected twice ([8ae437d](https://github.com/deepkit/deepkit-framework/commit/8ae437d6b412abfcf74d728290c6b0948b8bae88)), closes [#651](https://github.com/deepkit/deepkit-framework/issues/651)
- **mongo:** raw command return type of findOneOrUndefined ([9cc14ae](https://github.com/deepkit/deepkit-framework/commit/9cc14ae10755627a083cd2fd21e507876fab5459))
- **type:** don't flatten union members that are annotated ([9f83f6c](https://github.com/deepkit/deepkit-framework/commit/9f83f6cf12afbbbe031d82ab6e4ac9a5dd049cd7))

### Features

- **broker:** add BrokerBus.activateSubject(Subject) to manually subscribe and buffer a bus subject to the broker server ([8ce5a70](https://github.com/deepkit/deepkit-framework/commit/8ce5a70ce30743f528aa844fc50b188b3a01812b))
- **bson:** support deserialization of OID and all number types to string as fallback union member matcher ([83020c2](https://github.com/deepkit/deepkit-framework/commit/83020c24dd89a711f5719175692f122f8f8308c6))

## [1.0.10](https://github.com/deepkit/deepkit-framework/compare/v1.0.9...v1.0.10) (2025-05-24)

### Bug Fixes

- **rpc:** correctly unsubscribe Subject subscription created by action abstraction ([0e2424f](https://github.com/deepkit/deepkit-framework/commit/0e2424f7d5d2dc7b391748ca3af3016b4422006f))
- **rpc:** remove ObservableDisconnect and fix api-console-gui disconnecting observable ([a0cf750](https://github.com/deepkit/deepkit-framework/commit/a0cf7503558a1f2a4d6014b34cc01af70cea8c09))

### Features

- **broker:** make sure bus channel is only subscribed upon first subject subscriptions ([98cab64](https://github.com/deepkit/deepkit-framework/commit/98cab647b423aea8f41ac4c2f626a007d9a094dc))

### BREAKING CHANGES

- **rpc:** RPC will now longer call Subject.complete()/Subject.unsubscribe() on the Subject on the server when client does Subject.complete()/Subject.unsubscribe() or client disconnects. Instead, it just unsubscribes the single subscription created when the Subject is returned by the RPC controller. The Subject on the server can be monitored manually itself (by e.g. checking Subject.observed)
- **rpc:** Removed `disconnectObservable` as not needed anymore thanks to GC monitoring. Also, removed `instantObservable` (use defer() with switchMap() instead)

This allows to reuse now subjects that live longer than the rpc controller/connection.

## [1.0.9](https://github.com/deepkit/deepkit-framework/compare/v1.0.8...v1.0.9) (2025-05-23)

### Bug Fixes

- **bson:** rename type to BsonEncoder ([815f9a0](https://github.com/deepkit/deepkit-framework/commit/815f9a0f7f058455cddc2fe16cb4fa999ec56585))
- **mongo:** make sure finalizer is removed when transaction committed/rolled back ([14365f8](https://github.com/deepkit/deepkit-framework/commit/14365f8ac3d8ee6a72b3a4790f084e74ecb1d53c))
- **mongo:** only log heartbeat error max 10 times ([064f964](https://github.com/deepkit/deepkit-framework/commit/064f964e9f87166d0b9c2b1d57e667f68f24a226))
- **sqlite:** ensure logger is passed to adapter and first connection ([cf77b0f](https://github.com/deepkit/deepkit-framework/commit/cf77b0f6e906792f28dba5adc53167fdb33e410b))
- **website:** make sure docker build works + update angular ([5645721](https://github.com/deepkit/deepkit-framework/commit/5645721bd074f32bbcaf585e989cf5fcd10bceca))

### Features

- **broker:** add Subject<T> abstraction for decoupled and easy broker bus access ([4923b84](https://github.com/deepkit/deepkit-framework/commit/4923b846b548ef7823d9f827dd4a1690147a4345))
- **bson:** add TypeEncoder to encode all BSON types (not only container types) to BSON ([3f2aaf9](https://github.com/deepkit/deepkit-framework/commit/3f2aaf99be71a1c052c66243ac5308b1c7ae3a96))
- **bson:** make TypeEncoder also validate on encode and on the decoded value to ([d803bfb](https://github.com/deepkit/deepkit-framework/commit/d803bfbac57a36d746c9650a483a437a65ce992d))
- **logger:** add setLevel(string) to easily set log level without import LogLevel enum ([1162317](https://github.com/deepkit/deepkit-framework/commit/1162317b405afe237f8729628c22bf90f00fb7c9))

## [1.0.8](https://github.com/deepkit/deepkit-framework/compare/v1.0.7...v1.0.8) (2025-05-20)

### Bug Fixes

- **framework:** add missing BrokerKeyValue provider export ([5a58776](https://github.com/deepkit/deepkit-framework/commit/5a58776010cda5ff88196753f73d53d76bfaa940))
- **http:** proper handling of form & multipart values, plus multipart JSON field support ([#649](https://github.com/deepkit/deepkit-framework/issues/649)) ([7383c73](https://github.com/deepkit/deepkit-framework/commit/7383c7354a770076f92ffffa27eb4772b1fa434e))
- **http:** support array json request bodies ([2d3274e](https://github.com/deepkit/deepkit-framework/commit/2d3274e61f5c3fb10eabc186e8a8cfd66846a06f))
- **sql:** only alias a select when necessary ([26bc9fa](https://github.com/deepkit/deepkit-framework/commit/26bc9fa0a185538da291e53076375fec38718f10))
- **vite:** ensure correct typing ([0cf7511](https://github.com/deepkit/deepkit-framework/commit/0cf75110d07009967ffd3f1d8d580fedbe385564)), closes [#645](https://github.com/deepkit/deepkit-framework/issues/645)

### Features

- **bson:** add AutoBuffer to allow very fast buffer reuse in BSON serialization ([d8cdd6b](https://github.com/deepkit/deepkit-framework/commit/d8cdd6b44ac2ba880398407e4e53f3965ec71508))
- **logger:** allow setting a log level per scope ([c8177b2](https://github.com/deepkit/deepkit-framework/commit/c8177b21b7ceda751292aae0fc21c8682d701c6e))
- **sql:** support custom database field name filtering ([#650](https://github.com/deepkit/deepkit-framework/issues/650)) ([453f347](https://github.com/deepkit/deepkit-framework/commit/453f34712d41f575ae068382765232f769b24a9d))

### BREAKING CHANGES

- **logger:**

```
  // old
  logger.enableDebugScope('database')
  //new
  logger.setScopeLevel('database', LoggerLevel.debug);
```

```
// old
logger.disableDebugScope('database')
//new
logger.setScopeLevel('database', LoggerLevel.info);
```

## [1.0.7](https://github.com/deepkit/deepkit-framework/compare/v1.0.6...v1.0.7) (2025-04-18)

### Bug Fixes

- **bson:** serialize bigint in any container as long ([8a67d96](https://github.com/deepkit/deepkit-framework/commit/8a67d96f3aab6285ce53dd48494bc4be15b02785))
- **rpc:** missing .js extension on imports ([d0380c9](https://github.com/deepkit/deepkit-framework/commit/d0380c9dc665f3dca5c7901b8ed16f2abb4d0f49))
- **vite:** broken esm build ([eb3baca](https://github.com/deepkit/deepkit-framework/commit/eb3baca767a922d6ac01aa4ab245205cd173e6cf))

## [1.0.6](https://github.com/deepkit/deepkit-framework/compare/v1.0.5...v1.0.6) (2025-04-03)

### Bug Fixes

- **rpc:** make sure client disconnect trigger transport disconnect ([89ae002](https://github.com/deepkit/deepkit-framework/commit/89ae002b693f52deb32dbd07db1025fc61a9d8ec))

## [1.0.5](https://github.com/deepkit/deepkit-framework/compare/v1.0.4...v1.0.5) (2025-04-02)

### Bug Fixes

- **bson:** bigint with isNaN checks ([b46e228](https://github.com/deepkit/deepkit-framework/commit/b46e228428d6b09772a9a5161a7b261f93db585e))
- **filesystem:** ensure readLocalFile reads from local FS ([ad948e6](https://github.com/deepkit/deepkit-framework/commit/ad948e63d2f513fe52816baed3f1d48e3c2a8ac1)), closes [#637](https://github.com/deepkit/deepkit-framework/issues/637)
- **filesystem:** ensure writeFile forwards visibility ([57250a2](https://github.com/deepkit/deepkit-framework/commit/57250a20dc4051bad93b32830dc2f4015dcc6826)), closes [#638](https://github.com/deepkit/deepkit-framework/issues/638)
- **http:** disable compression by default ([257cb61](https://github.com/deepkit/deepkit-framework/commit/257cb61ae6e3732e45a54a08ae5b751e3f28d8dd)), closes [#592](https://github.com/deepkit/deepkit-framework/issues/592)
- **type:** remove Inject (moved to @deepkit/core ([06d650a](https://github.com/deepkit/deepkit-framework/commit/06d650acf5537fda36b73ad94e928009342cdad5)), closes [#587](https://github.com/deepkit/deepkit-framework/issues/587)
- **type:** replace more Inject imports ([5a88760](https://github.com/deepkit/deepkit-framework/commit/5a88760d90533ef38bc73ba9ad9af17cc64c728f))

### Features

- **bench:** new @deepkit/bench package for doing benchmarks ([210bd84](https://github.com/deepkit/deepkit-framework/commit/210bd844e604a74502b1875e7a6794b059138d46))
- **bson:** convert if-else branch to lookup ([3589e62](https://github.com/deepkit/deepkit-framework/commit/3589e62f7d35b6462925758973fe54cb41aa8497))
- **core:** export AsyncFunction ([cebd164](https://github.com/deepkit/deepkit-framework/commit/cebd164671543e106dee4459e2741dfe12f00020))
- **framework:** new option `logStartup` to control startup rpc/http endpoints logging ([7695822](https://github.com/deepkit/deepkit-framework/commit/7695822cd849915ece9d5d88ac94ca2aed9d304e))
- **injector:** better docs ([7402f11](https://github.com/deepkit/deepkit-framework/commit/7402f117c230a6f23e892d0e5e91534f1b0bf005))
- **injector:** refactor internal code to get big performance improvement ([f295c5e](https://github.com/deepkit/deepkit-framework/commit/f295c5e77507f234ae2ee3cffdd55561ef294998))
- **logger:** add debug2 level + more control over scope log level ([be01b73](https://github.com/deepkit/deepkit-framework/commit/be01b7395336badef3f215dc5df7bfba0a8b4b22))
- **run:** new @deepkit/run package to run typescript easily ([0b9246e](https://github.com/deepkit/deepkit-framework/commit/0b9246edaab9deb80b6855cba90f48baa4562e08))

## [1.0.4](https://github.com/deepkit/deepkit-framework/compare/v1.0.3...v1.0.4) (2025-03-13)

### Bug Fixes

- **rpc:** export events ([829317c](https://github.com/deepkit/deepkit-framework/commit/829317c0e7ef2dfbabe7e844258b3c5cd8c8c7df))

## [1.0.3](https://github.com/deepkit/deepkit-framework/compare/v1.0.2...v1.0.3) (2025-03-13)

### Bug Fixes

- **api-console-module:** correctly parse HttpBodyValidation and HttpRequestParser ([3a5a048](https://github.com/deepkit/deepkit-framework/commit/3a5a04804dfce3a6b906e8e32fb524a62891e649))
- **broker:** ensure no dangling Promise ([9056812](https://github.com/deepkit/deepkit-framework/commit/90568125151e7daafb1ea1bb81d1175c6343b50c))
- **create-app:** update dep versions ([6d12d4a](https://github.com/deepkit/deepkit-framework/commit/6d12d4a9853ec5f9c922aaf5838a070450efc300))
- **desktop-ui:** adjust to new event api ([38ef6b8](https://github.com/deepkit/deepkit-framework/commit/38ef6b8250b8544f90588dd29306f2653eaa749e))
- **desktop-ui:** ng-packagr build and safari styling ([956ca9b](https://github.com/deepkit/deepkit-framework/commit/956ca9b7ff98e598c7ab9632eaf4303ef37070b7))
- **http:** better defaults for new formidable version ([5c9788e](https://github.com/deepkit/deepkit-framework/commit/5c9788ebfb4b3ab3f056cbaa1ff79a109015f5ba))
- **logger:** ensure scoped Logger maintain reference to log level ([3874148](https://github.com/deepkit/deepkit-framework/commit/387414895af893bbaa0a6874631d0ac47ab165c8))
- **mongo:** hello command ([30cbad5](https://github.com/deepkit/deepkit-framework/commit/30cbad5e745d9e3a60d212cb0814da3c2758753e))
- **mongo:** transactions ([e4781db](https://github.com/deepkit/deepkit-framework/commit/e4781db2a1f9766b811713f501b630adc384e6e7))

### Features

- **bson:** new BsonStreamReader ([3faa77a](https://github.com/deepkit/deepkit-framework/commit/3faa77a8fdf41315697670353c574b2954584dec))
- **desktop-ui:** allow to pass ConnectedPosition strategy to dropdown component ([9ffd941](https://github.com/deepkit/deepkit-framework/commit/9ffd941092b347ed68108a758411edada20fff41))
- **devtool:** new chrome devtool to debug rpc connections ([80c5105](https://github.com/deepkit/deepkit-framework/commit/80c5105dd7ceb2cb30c15d54b2aca14a35e5a9f3))
- **devtool:** reduce needed permissions and make it explicit for each domain ([1cb03cd](https://github.com/deepkit/deepkit-framework/commit/1cb03cd30dfada89c5c66e91380d78cdb254516b))
- **event:** align API with Event web standards ([0e1dca2](https://github.com/deepkit/deepkit-framework/commit/0e1dca28fd8bbfb5232f9f9df4654598744d77a0))
- **event:** allow late event listening, new synchronous event dispatching with 15x performance improvement ([0cc6843](https://github.com/deepkit/deepkit-framework/commit/0cc68438b2b933ee8241bbcca310ac79fea2b5c9))
- **event:** allow sync tokens with sync dispatching and sync listeners ([798dfb7](https://github.com/deepkit/deepkit-framework/commit/798dfb72670ce26d6d2904e48a2edded42fd4b46))
- **injector:** improve error messages, make it very clear what failed and where providers are located ([5866eda](https://github.com/deepkit/deepkit-framework/commit/5866eda8ece1705bb9d1df655d53c70cd77f43a8))
- **injector:** improve prepared resolver performance by 11x and dynamic `Injector.get` by 17x ([3906e2c](https://github.com/deepkit/deepkit-framework/commit/3906e2c013782fee2b27a3ff99da5b1e912b8458))
- **mongo,orm,logger:** improve transaction safety and logging ([95faf2c](https://github.com/deepkit/deepkit-framework/commit/95faf2c0143a34ba3524db290719692cc93593d3))
- **mongo:** add replica set support, rework connection handling ([7fe1a9a](https://github.com/deepkit/deepkit-framework/commit/7fe1a9aac6c799b33cdea7b1454464ebabc131d6))
- **mongo:** add support for read preference via Query API ([c829762](https://github.com/deepkit/deepkit-framework/commit/c829762ef6ec1f4b9a57c89d19f09dce39e5b940))
- **mongo:** more statistics, optimise error message when primary is not reachable ([0cd4e1e](https://github.com/deepkit/deepkit-framework/commit/0cd4e1eaf2127fb2ff7b4a729c3ef6eeb9f0d5fa))
- **rpc:** add utility functions to create Subject/Observable synchronously from an RPC controller ([349668f](https://github.com/deepkit/deepkit-framework/commit/349668fe0d2586831fc21d4b0d130bd1b8a2ffbb))
- **rpc:** automatically garbage collect observables + new event system + stats collection ([d727232](https://github.com/deepkit/deepkit-framework/commit/d727232ca4b445a6bc82de8df31e25ba2d60d683))
- **rpc:** improve disconnect handling and cleaning up RpcMessageSubject correctly ([9d9e29a](https://github.com/deepkit/deepkit-framework/commit/9d9e29ad2bffa91751a78486fe031d9b8a8fecf7))
- **rpc:** improve performance by 25% ([f7e524f](https://github.com/deepkit/deepkit-framework/commit/f7e524fabafe1b54047a642744373a0db611ce93))
- **sql:** migration support for node v22 without ts-node dependency ([f939ea1](https://github.com/deepkit/deepkit-framework/commit/f939ea1bad49363b729a019f335cdf0253a619e9))

### BREAKING CHANGES

- **event:** stopPropagation() becomes stopImmediatePropagation().

New BaseEvent.preventDefault() which replaces custom solutions like stop() in DatabaseEvent.

## [1.0.2](https://github.com/deepkit/deepkit-framework/compare/v1.0.1...v1.0.2) (2025-02-24)

### Bug Fixes

- **type-compiler:** make sure not annotated properties get unknown as type ([b262534](https://github.com/deepkit/deepkit-framework/commit/b262534d5c516c975b9b7d818539f92043f5736e))
- **website:** complete ssr and docker build ([90371f2](https://github.com/deepkit/deepkit-framework/commit/90371f2363f7d667a41e662c64be728bef92b4f8))

### Features

- **angular-ssr:** support server:start serving of angular routes ([ee3972c](https://github.com/deepkit/deepkit-framework/commit/ee3972cb07766299e315d885a1ee82ca6a49dda9))
- **rpc:** allow to register hooks for rpc kernel and actions ([cb0102b](https://github.com/deepkit/deepkit-framework/commit/cb0102bf51a0b508dbacbc5d6010fbed058f52cd))

## [1.0.1](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.160...v1.0.1) (2025-02-24)

### Bug Fixes

- **app:** remove deepkit-openapi since incompatible ([f825f27](https://github.com/deepkit/deepkit-framework/commit/f825f27d1ad691211333d9849b46045f3010ca21))
- **framework-debug-gui:** hide broker menu ([ecf1b27](https://github.com/deepkit/deepkit-framework/commit/ecf1b27647567adcc8cd956c11de3d78955fbc72))
- **type-compiler:** check in installer if file exists ([eb07783](https://github.com/deepkit/deepkit-framework/commit/eb0778318fb369b0eaabb9ee04d76f88d27f4f90)), closes [#630](https://github.com/deepkit/deepkit-framework/issues/630)
- **ui-library:** missing module import ([30f80d3](https://github.com/deepkit/deepkit-framework/commit/30f80d345fe5cbf85f8722650c8fbdcc1bdfd8da))

## [1.0.1-alpha.160](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.159...v1.0.1-alpha.160) (2025-02-18)

### Bug Fixes

- **angular-ssr:** remove usage of angular internals ([ae91295](https://github.com/deepkit/deepkit-framework/commit/ae91295e7da71b6f4c1e7672bcc5983b267f8ee7))
- **type:** make typeAnnotation backwards compatible to metaAnnotation ([8be8b5e](https://github.com/deepkit/deepkit-framework/commit/8be8b5e154eca10fc7cd398347886209d2fa49ae))
- **website:** docs about typeAnnotation ([83bab92](https://github.com/deepkit/deepkit-framework/commit/83bab92a01f2846aa8303359638414a935992820))

## [1.0.1-alpha.159](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.158...v1.0.1-alpha.159) (2025-02-18)

### Bug Fixes

- **mongo:** update saslprep ([5413295](https://github.com/deepkit/deepkit-framework/commit/5413295aca72f3f75d672853d861aa662c43299b))

## [1.0.1-alpha.158](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.157...v1.0.1-alpha.158) (2025-02-15)

### Bug Fixes

- **desktop-ui:** package scripts ([05e86f0](https://github.com/deepkit/deepkit-framework/commit/05e86f0a6ebbf77fcc293130489461482806a3e3))
- **desktop-ui:** package scripts ([4b64f7f](https://github.com/deepkit/deepkit-framework/commit/4b64f7ff84b801227df009c880b95da95e38f1f2))

## [1.0.1-alpha.157](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.156...v1.0.1-alpha.157) (2025-02-15)

### Bug Fixes

- **angular-ssr:** docs ([eae7291](https://github.com/deepkit/deepkit-framework/commit/eae729141372fc83492a9b66d479eb121eec7a0f))
- **core:** disable reflection in indent.ts ([9bbc278](https://github.com/deepkit/deepkit-framework/commit/9bbc2780b904996f51f6ab97ac87566e86f02ddc))
- **core:** pass correct global in indent.ts ([b1558e4](https://github.com/deepkit/deepkit-framework/commit/b1558e455271f7d6e282ff0668665da4eb8f4920))
- **http:** isElementStruct with null ([04e54b0](https://github.com/deepkit/deepkit-framework/commit/04e54b0dd7888592fa9db1adbf3003b1e4abe4fa))
- **rpc:** ensure message size is reset to 0 after reaching a buffer that is too small ([c78a2a2](https://github.com/deepkit/deepkit-framework/commit/c78a2a26b98384ae6d1e6b87aa993e77026f4e7c))
- tsconfig and tsc build ([ac71e83](https://github.com/deepkit/deepkit-framework/commit/ac71e838d542a3cab0e9b1cfc20b27637f1c01df))
- **type:** convert TypeAnnotation into intrinsic type ([#629](https://github.com/deepkit/deepkit-framework/issues/629)) ([4d1a13e](https://github.com/deepkit/deepkit-framework/commit/4d1a13ec11536e1951f5e348bd0b43b2244cccca)), closes [#626](https://github.com/deepkit/deepkit-framework/issues/626)
- **type:** ensure union check in deserialize mode to handle property with default value correctly ([11c2116](https://github.com/deepkit/deepkit-framework/commit/11c21167a06e6eaee46941d4aee13323581caa52)), closes [#623](https://github.com/deepkit/deepkit-framework/issues/623)
- **type:** remove debug code ([fefd9a3](https://github.com/deepkit/deepkit-framework/commit/fefd9a33a8c9c7edf0267ece2e6f33b4913cd173))

### Features

- **event:** better doc blocks for listen ([452dc6a](https://github.com/deepkit/deepkit-framework/commit/452dc6abfc005cc99b2def853cc15251fb5c732d))
- **http:** update formidable to ^3.5.2 ([e4007c3](https://github.com/deepkit/deepkit-framework/commit/e4007c39a63dddeb7dadbdd8914cfaa954a059e7))
- **rpc:** make binary parser more stable and throw better error message on decoding failure ([66e8f0d](https://github.com/deepkit/deepkit-framework/commit/66e8f0d196ed3f6c7ec2d7b4d106afb4e21d1d54))
- **rpc:** show invalid binary message in hex on error ([1a7bf16](https://github.com/deepkit/deepkit-framework/commit/1a7bf16a04282125fd3c5c0154bad39beaf8e14d))
- **sqlite:** update better-sqlite3 to 11.8.1 ([cb1eafd](https://github.com/deepkit/deepkit-framework/commit/cb1eafd48306bd6c656b392adc865d48dd425a02))
- **type-compiler:** support trivially inferred types ([087b60a](https://github.com/deepkit/deepkit-framework/commit/087b60ae8f964dd4e9f477c9346234ef79ccef4a))
- update to angular 19 and typescript 5.7.3, new @deepkit/angular-ssr package ([#627](https://github.com/deepkit/deepkit-framework/issues/627)) ([52333a7](https://github.com/deepkit/deepkit-framework/commit/52333a71f98c7e25a74f048dd57f1efba61098f5))
- **website:** adjust docs createModule -> createModuleClass ([763bfa9](https://github.com/deepkit/deepkit-framework/commit/763bfa9a443a9342117c1f11519ba95c1e5b6b28))

## [1.0.1-alpha.156](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.155...v1.0.1-alpha.156) (2025-01-30)

### Bug Fixes

- **bson:** initial random value of incremental counter of ObjectId ([fb1263d](https://github.com/deepkit/deepkit-framework/commit/fb1263dbd9fbaae0bd9ecbf40f840698e4523e0c))
- **bson:** throw on invalid string data ([423df6c](https://github.com/deepkit/deepkit-framework/commit/423df6c681c226d8b4bff8c909ccd745c3c61c13))
- don't process delete PKs if norows were affected ([#621](https://github.com/deepkit/deepkit-framework/issues/621)) ([f2f6ed0](https://github.com/deepkit/deepkit-framework/commit/f2f6ed03f21bf5d6a9424c644d899d269cd3a354))
- **type:** make sure forwarded type arguments reset Ω at the origin ([3138671](https://github.com/deepkit/deepkit-framework/commit/31386718f3fc634983c0eedd652105765e3e6a75)), closes [#619](https://github.com/deepkit/deepkit-framework/issues/619)

### Features

- **bson:** decrease threshold to when TextDecoder is used to decoder utf8 ([4daed1c](https://github.com/deepkit/deepkit-framework/commit/4daed1c43e29a80c205aac35ab85317fdb936c9c))

## [1.0.1-alpha.155](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.154...v1.0.1-alpha.155) (2024-10-30)

### Bug Fixes

- **framework:** di token to label ([0b37a21](https://github.com/deepkit/deepkit-framework/commit/0b37a21a6a0889bff3f82c8eb2d26884a26a3228))
- **type:** add executeTypeArgumentAsArray + custom iterable example with manual implementation ([0781a1a](https://github.com/deepkit/deepkit-framework/commit/0781a1ab733a5b06b0c89ec854274e0a8115696a))
- **type:** symbols as method names ([2be4ce6](https://github.com/deepkit/deepkit-framework/commit/2be4ce6e728197c55524fc1f009b6a2946af022f))

## [1.0.1-alpha.154](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.153...v1.0.1-alpha.154) (2024-09-06)

### Bug Fixes

- **bson:** make sure index signature keys use full utf8 encoding ([d447c1d](https://github.com/deepkit/deepkit-framework/commit/d447c1d1b12f2331aec8519fec67335151b0183a))
- **sql:** fix queries where value legitimately begins with $ ([#580](https://github.com/deepkit/deepkit-framework/issues/580)) ([e0a0c3f](https://github.com/deepkit/deepkit-framework/commit/e0a0c3f10d7f22cd79760d032c6c90b797e48d9f))
- **sql:** repair & enable @deepkit/sql tests ([#579](https://github.com/deepkit/deepkit-framework/issues/579)) ([81a1ab1](https://github.com/deepkit/deepkit-framework/commit/81a1ab1e82ae170034545a25aa540a3a7c69acd7))
- **type-compiler:** include enum annotations in .d.ts transformation ([#607](https://github.com/deepkit/deepkit-framework/issues/607)) ([08854f3](https://github.com/deepkit/deepkit-framework/commit/08854f3d1aff429b70c384aeaf54538b1f49c079))
- **type:** add scope in setter code to prevent `variable already declared` [#603](https://github.com/deepkit/deepkit-framework/issues/603) ([#606](https://github.com/deepkit/deepkit-framework/issues/606)) ([9af344f](https://github.com/deepkit/deepkit-framework/commit/9af344f4705943571bc0c18e73435b18c4819641))
- **website:** modify broken reflection example ([#599](https://github.com/deepkit/deepkit-framework/issues/599)) ([7ee0a75](https://github.com/deepkit/deepkit-framework/commit/7ee0a75f2ddbeff137239fecb72e409ab128bc1c))

### Features

- **http:** http timeout options ([44fbf56](https://github.com/deepkit/deepkit-framework/commit/44fbf5672344f6296de6f62ca2295be17d88501f))
- **rpc:** make Buffer dependency optional ([2f32a12](https://github.com/deepkit/deepkit-framework/commit/2f32a1214c2c4555371fc1cfccdfdf533c21128e))
- **type:** support enum in pathResolver/resolvePath ([78d7df0](https://github.com/deepkit/deepkit-framework/commit/78d7df08af6845c3986bc55a7c8b1dc3353d8847))

## [1.0.1-alpha.153](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.152...v1.0.1-alpha.153) (2024-06-06)

### Bug Fixes

- **app:** don't force package.json to exist for finding env files ([f478e96](https://github.com/deepkit/deepkit-framework/commit/f478e966103fbfde1289fdfbebe2b235bf19875f))
- **bson:** make sure NaN is deserialized as 0 ([7b19397](https://github.com/deepkit/deepkit-framework/commit/7b193977a35fceac4402829d0709d909e3ef6f8e))
- **orm:** correctly resolve reference class schemas ([e193325](https://github.com/deepkit/deepkit-framework/commit/e193325b561563f0207403103cd8caf859228cc2))
- **rpc:** add interface for fetch ([6035736](https://github.com/deepkit/deepkit-framework/commit/60357366ec1db553789909889bf3489dea17a269))
- **rpc:** http adapter wrong authorization + remove OPTIONS method ([3ff8955](https://github.com/deepkit/deepkit-framework/commit/3ff89556961864ceffea188e33e0af0404cd44b3))
- **rpc:** make sure Error is chained and ValidationError correctly handled ([5c49778](https://github.com/deepkit/deepkit-framework/commit/5c49778da68baaab6e7d9588acb03af7d891bf3a))
- **website:** angular 18 fixes ([4307a5d](https://github.com/deepkit/deepkit-framework/commit/4307a5dbdadcbfed5d09b9b5907a3b76f75f0022))

### Features

- **broker:** new BrokerKeyValue and broker documentation ([1f53bc8](https://github.com/deepkit/deepkit-framework/commit/1f53bc8962c5186c2be16953eeae2b9187c11877))
- **orm:** support passing type to Database.persistAs/Database.removeAs, DatabaseSession.addAs ([6679aba](https://github.com/deepkit/deepkit-framework/commit/6679aba8517b46575b92edaa3a9f59ea90f9f762)), closes [#571](https://github.com/deepkit/deepkit-framework/issues/571)
- **rpc:** add http transport ([3b2c6cc](https://github.com/deepkit/deepkit-framework/commit/3b2c6cc6c75d70e3b6bfac7d53e3e7606696baf4))
- **type:** automatically assign .path to SerializationError in TemplateState.convert() errors ([1e8d61d](https://github.com/deepkit/deepkit-framework/commit/1e8d61d38e7310360c834605887c96fb33d0d4ac))
- **type:** automatically assign .path to SerializationError in TemplateState.convert() errors ([23781a1](https://github.com/deepkit/deepkit-framework/commit/23781a1949d445d769cfc3704c25bc69a27c7350))
- **website:** improve broker docs ([1ff9600](https://github.com/deepkit/deepkit-framework/commit/1ff960054404c5bb2105471168fd21ea4f6c9f5a))
- **website:** migrated to Angular v18 SSR + Signals ([322817f](https://github.com/deepkit/deepkit-framework/commit/322817fd60a86ea2d4806e721a860642ec02d9ad))
- **website:** update angular to v18 ([4dcc38c](https://github.com/deepkit/deepkit-framework/commit/4dcc38cac90614282ea2610bfab8586f7e923d5f))

## [1.0.1-alpha.152](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.151...v1.0.1-alpha.152) (2024-05-16)

### Features

- **rpc:** client.transporter.errored subject ([0fc2bd4](https://github.com/deepkit/deepkit-framework/commit/0fc2bd4aa904bdae9398f4e4c7db602afd3bcbc4))

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

- **http:** support for JSON array payloads ([#564](https://github.com/deepkit/deepkit-framework/issues/564)) ([feeeaa6](https://github.com/deepkit/deepkit-framework/commit/feeeaa6ef9f76d67f85b25f4d243b27ceb00360b))
- **mysql:** ensure `number & AutoIncrement` is always `int` ([69feb17](https://github.com/deepkit/deepkit-framework/commit/69feb17276f0f23ef32a331b36fa58ce0b001ae5))
- **sqlite:** make sure ALTER TABLE are not aggregated ([74ef2eb](https://github.com/deepkit/deepkit-framework/commit/74ef2eb340924306dcd59b4d913d0eb32f88757f))
- **type:** make sure handled constructor properties are not set twice ([2e82eb6](https://github.com/deepkit/deepkit-framework/commit/2e82eb6fe6bb8b519b8f170334740ee9f7f988be))
- **type:** resolve global classes as shallow TypeClass ([d976024](https://github.com/deepkit/deepkit-framework/commit/d97602409b1e8c1d63839e2d1b75d16a0ccd4cfd))
- **website:** docs about DI configureProvider and nominal tyoes ([e5dafb4](https://github.com/deepkit/deepkit-framework/commit/e5dafb47126411e8b369aa78cead32e02b4ee7c9))

## [1.0.1-alpha.146](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.145...v1.0.1-alpha.146) (2024-04-17)

### Bug Fixes

- **type-compiler:** esm import of micromatch ([5606d74](https://github.com/deepkit/deepkit-framework/commit/5606d7404ad4ff1e94c5c12cbf94a532e9ae41ce))

## [1.0.1-alpha.145](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.144...v1.0.1-alpha.145) (2024-04-08)

### Bug Fixes

- **filesystem-aws-s3:** use correct path normalize function ([58042a9](https://github.com/deepkit/deepkit-framework/commit/58042a99dc1f25d92effb766842fea199568f8f6))
- **http:** make sure invalid formidable files are skipped ([d1ff09b](https://github.com/deepkit/deepkit-framework/commit/d1ff09ba17e82891b25c192dec7bdf2d9b921f24))
- **orm:** make sure persistence is always closed on flush ([015d90a](https://github.com/deepkit/deepkit-framework/commit/015d90af15503c4159e4810cb6f862349a4599f1))
- **sql:** dates should be nullable without casting as JSON ([#553](https://github.com/deepkit/deepkit-framework/issues/553)) ([d34b1a3](https://github.com/deepkit/deepkit-framework/commit/d34b1a30ad9371f01eb806ac37f2861754ce9959))
- **sql:** resolve `Date|null` to date type ([ab12802](https://github.com/deepkit/deepkit-framework/commit/ab12802c307d9dcf17925526dd5dcf87c87e8899))
- type guard handing of empty Map/Set ([da4cf82](https://github.com/deepkit/deepkit-framework/commit/da4cf8242a317157f8b02c67d2b5754fb8f29381))
- **website:** fix ssr, remove some pages ([51b9b36](https://github.com/deepkit/deepkit-framework/commit/51b9b3681f46faf368c429302e127cf8c279d18d))

## [1.0.1-alpha.144](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.143...v1.0.1-alpha.144) (2024-03-19)

### Bug Fixes

- **postgres:** use DatabaseField<{type}> for type mapping if available ([107399a](https://github.com/deepkit/deepkit-framework/commit/107399aa2fcbe14307ff4ad49937275bdcef5493))
- **website:** fix deps + builds ([4183580](https://github.com/deepkit/deepkit-framework/commit/4183580c1a17c23f20db0d12744dd33d14d9623d))

## [1.0.1-alpha.143](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.142...v1.0.1-alpha.143) (2024-03-17)

### Bug Fixes

- **core:** don't include stack in formatError per default ([1b603ee](https://github.com/deepkit/deepkit-framework/commit/1b603eef2938ab010fb6d83836894ad5a1c236af))
- **http:** parameter service injection into route methods with encapsulated modules ([9c98f8b](https://github.com/deepkit/deepkit-framework/commit/9c98f8b110078ab35882fece44f45fde34a4feeb))
- **type-compiler:** also parse tsx source files ([80464bf](https://github.com/deepkit/deepkit-framework/commit/80464bf2bd38477e7ce7898fde17b6d6738007f7)), closes [#560](https://github.com/deepkit/deepkit-framework/issues/560)
- **type:** print Error cause chain in formatError ([c2a413a](https://github.com/deepkit/deepkit-framework/commit/c2a413aeb74155ddb29f1939b48e034f05d9ae60))
- **type:** union expansions in intersections ([332b26e](https://github.com/deepkit/deepkit-framework/commit/332b26eb148d916d03f49fad0daaad083c24207a)), closes [#556](https://github.com/deepkit/deepkit-framework/issues/556)

### Features

- **desktop-ui:** support queryParams in list route support ([6f33804](https://github.com/deepkit/deepkit-framework/commit/6f3380469c22d8c146367889c8afd55d8df15292))
- **injector:** improve set method api ([#557](https://github.com/deepkit/deepkit-framework/issues/557)) ([eb92e58](https://github.com/deepkit/deepkit-framework/commit/eb92e58a44a25170f29150aae89b2dfad33a3495))
- **mysql, postgres:** add support for connection URLs ([2518670](https://github.com/deepkit/deepkit-framework/commit/25186701e3d6ea60ea232cbcc0c989e195df9edf))

## [1.0.1-alpha.142](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.141...v1.0.1-alpha.142) (2024-03-06)

### Bug Fixes

- **type-compiler:** support windows reflection pattern matching ([cec3146](https://github.com/deepkit/deepkit-framework/commit/cec3146612b7b950cbd47eb2850feb887b87fc82))

## [1.0.1-alpha.141](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.140...v1.0.1-alpha.141) (2024-03-05)

### Bug Fixes

- **orm:** remove browser export ([58bb3c8](https://github.com/deepkit/deepkit-framework/commit/58bb3c864e6d4fb2794835e748cf5a950bf923af))
- **rpc:** maintain strictSerialization option also in new observables ([273330b](https://github.com/deepkit/deepkit-framework/commit/273330b102c30f62895bd7d3b8b6d6762e080740))
- **type:** handle `Function` correctly in type comparisons ([16f0c1d](https://github.com/deepkit/deepkit-framework/commit/16f0c1da4b6e2ce216c45681e1574bfe68c9044f))

## [1.0.1-alpha.140](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.139...v1.0.1-alpha.140) (2024-03-02)

### Bug Fixes

- **framework:** also disconnect broker/stopwatch onServerShutdown ([69c56eb](https://github.com/deepkit/deepkit-framework/commit/69c56ebaa4c80bc612d784b84011d4a557f2853c))

### Features

- **sql:** support per-field name remapping ([63b8aaf](https://github.com/deepkit/deepkit-framework/commit/63b8aaface420a98f14511b22efaffc9628be41d))

## [1.0.1-alpha.139](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.138...v1.0.1-alpha.139) (2024-02-29)

### Bug Fixes

- **create-app:** adjust example app to new API changes ([d2b1c26](https://github.com/deepkit/deepkit-framework/commit/d2b1c260d557ab46f2ad5b467927e7fd5e1a88cd))
- **rpc:** only print warning text, not error ([ed8cfe7](https://github.com/deepkit/deepkit-framework/commit/ed8cfe7733a36b79a8802afec9280f74d51a6b1b))
- **type-compiler:** mark the right SourceFile object as processed ([38cfdf0](https://github.com/deepkit/deepkit-framework/commit/38cfdf06910cfbd01755805022f97ed6afa8dd4d))
- **type:** better error message when fast path type resolution fails due to undefined symbols ([0ef082d](https://github.com/deepkit/deepkit-framework/commit/0ef082d4b474b7d36d7668cf21ad8a9922469189))

## [1.0.1-alpha.138](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.137...v1.0.1-alpha.138) (2024-02-27)

### Bug Fixes

- **type:** make sure methods are not part of deserialization/type guard union resolver ([eb08a73](https://github.com/deepkit/deepkit-framework/commit/eb08a73db15c4d66f69646fe9f34b3c884e602a6))

## [1.0.1-alpha.137](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.136...v1.0.1-alpha.137) (2024-02-26)

### Bug Fixes

- **app:** allow to inject optional services ([52fd21f](https://github.com/deepkit/deepkit-framework/commit/52fd21ff2214a0fa87e314751f4e0a82a78fc908))
- **desktop-ui:** correctly unregister destroyed sidebar ([8613ae4](https://github.com/deepkit/deepkit-framework/commit/8613ae495d9727df04a996dc5803d903b4a7b571))
- **framework:** order of scoped services to allow injecting HttpRequest in RpcKernelSecurity ([9a5e300](https://github.com/deepkit/deepkit-framework/commit/9a5e300906feebb20a4b5169984e68e9fa14a057))
- **type:** correctly type guard `null` in optional properties ([c0adcb0](https://github.com/deepkit/deepkit-framework/commit/c0adcb00ce100b4c01bc6a1d793396b806464f3c))

## [1.0.1-alpha.136](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.135...v1.0.1-alpha.136) (2024-02-20)

### Bug Fixes

- **desktop-ui:** correctly publish package.json ([23f14ac](https://github.com/deepkit/deepkit-framework/commit/23f14aca049007bf18d16e2d4d6d01ca6079b5a4))

## [1.0.1-alpha.135](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.134...v1.0.1-alpha.135) (2024-02-16)

### Features

- **rpc:** reuse type cache across connections + made strictSerialization(false) less strict ([1b55b08](https://github.com/deepkit/deepkit-framework/commit/1b55b085aee23a53070daa3d179cd86734608b57))

## [1.0.1-alpha.134](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.133...v1.0.1-alpha.134) (2024-02-15)

### Bug Fixes

- **bson:** allow to serialize null to optional property ([77b0020](https://github.com/deepkit/deepkit-framework/commit/77b0020cae3af636937577458d5b584c3d6864bf))

### Features

- **rpc:** allow to disable strict serialization and validation ([d7a8155](https://github.com/deepkit/deepkit-framework/commit/d7a8155328dca9dca16c3bea88794002fa6f5cba))
- **rpc:** use rpc.logValidationErrors also for strict serializer ([78f57e9](https://github.com/deepkit/deepkit-framework/commit/78f57e92dd457004644d2fa717e6550782a06d3c))

## [1.0.1-alpha.133](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.132...v1.0.1-alpha.133) (2024-02-15)

### Bug Fixes

- **bson:** fix surrogate pair decoding ([cb9f648](https://github.com/deepkit/deepkit-framework/commit/cb9f648cb587c6c0553fceaf0dc57d90ac34321c))

### Features

- **app:** allow array flags in object literal ([690927c](https://github.com/deepkit/deepkit-framework/commit/690927cc5015419e445a43df8b2729a9e496994b))
- **bson:** export new wrapObjectId/wrapUUId for faster any serialization ([718839b](https://github.com/deepkit/deepkit-framework/commit/718839b00c404239c7b666fe1e5e2d8c2e084d99))
- **mongo:** add readPreference support ([6275c37](https://github.com/deepkit/deepkit-framework/commit/6275c377a557c5eda3d50b35f2b8ab5e868861dc))
- **rpc:** allow serialization of unknown Observable type ([0014074](https://github.com/deepkit/deepkit-framework/commit/00140743b3cec674f7eda89a034c46720c5c96ae))

## [1.0.1-alpha.132](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.131...v1.0.1-alpha.132) (2024-02-10)

### Bug Fixes

- **rpc:** better error message when no observable type can be extracted ([5e7ecf1](https://github.com/deepkit/deepkit-framework/commit/5e7ecf12adf526b103757ede04ed7ec6923a7af6))
- **sql:** strings should be nullable without casting as JSON ([#552](https://github.com/deepkit/deepkit-framework/issues/552)) ([fe55b7f](https://github.com/deepkit/deepkit-framework/commit/fe55b7feb3dc312c31b8dd6dd671ca0150ff5dee))
- **type:** intersection of two different primitive types always return never ([#549](https://github.com/deepkit/deepkit-framework/issues/549)) ([20d3dc8](https://github.com/deepkit/deepkit-framework/commit/20d3dc83a00431db99f6feb0f41da890fa422f48))

### Features

- **mongo:** export custom command API ([d82ccd1](https://github.com/deepkit/deepkit-framework/commit/d82ccd19df86f84e8feacbe124e1d473ff481b8c))

## [1.0.1-alpha.131](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.130...v1.0.1-alpha.131) (2024-02-09)

### Bug Fixes

- **http:** make sure all path parameters are available in HttpRequestParser ([e215420](https://github.com/deepkit/deepkit-framework/commit/e215420edf4889d116b01ca0f52109e7167e7b63))
- **rpc:** error Observable Subscribers when no Observable Next type can be detected ([e207fea](https://github.com/deepkit/deepkit-framework/commit/e207fea1d9abbb61f8e33d8253fe3ce5e23022d0))
- **type:** make sure cast<string> throws when null/undefined is passed ([1bb3641](https://github.com/deepkit/deepkit-framework/commit/1bb3641f3db8196c9bcab64ef17004dc5e1f9f4c))

## [1.0.1-alpha.130](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.129...v1.0.1-alpha.130) (2024-02-07)

### Bug Fixes

- **http:** don't include resolver/DI objects into HttpRequestParser ([be189c5](https://github.com/deepkit/deepkit-framework/commit/be189c5bcf8d5d57e5c9a1738e458e370bff2b50))

### Features

- **http:** allow to fetch unused path parameters in HttpRequestParser ([cc3cd3b](https://github.com/deepkit/deepkit-framework/commit/cc3cd3bc4a0a75906e43ae764bff473a81b09d1b))

## [1.0.1-alpha.129](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.128...v1.0.1-alpha.129) (2024-02-07)

### Features

- **http:** also read path parameters in HttpRequestParser<T> ([888d058](https://github.com/deepkit/deepkit-framework/commit/888d058b900b29fa39a2d77a6aa5e8946f2ee5e7))

## [1.0.1-alpha.128](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.127...v1.0.1-alpha.128) (2024-02-06)

### Bug Fixes

- **framework:** esm import ([a9927c2](https://github.com/deepkit/deepkit-framework/commit/a9927c2507be69b59ee13c45ae315e95aef84898))
- **injector:** correctly label symbols ([ac07f21](https://github.com/deepkit/deepkit-framework/commit/ac07f2134ec21fd0f114bc9751d700f46e0f5607))
- **postgres:** don't crash when no index can be extracted ([c80e88f](https://github.com/deepkit/deepkit-framework/commit/c80e88f2379a8c956d4921922b177685547e7278))

### Features

- **http:** add new HttpRequestParser<T> injection token ([6101f83](https://github.com/deepkit/deepkit-framework/commit/6101f830897e071e72b8e873bda6dbeee69cdc1e))

## [1.0.1-alpha.127](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.126...v1.0.1-alpha.127) (2024-02-06)

### Bug Fixes

- **framework:** wrong ESM import ([9ec0df2](https://github.com/deepkit/deepkit-framework/commit/9ec0df218ddd42dba52b2ac892701b9d9bff216a))
- **sql:** wrong ESM import ([08996bb](https://github.com/deepkit/deepkit-framework/commit/08996bb2606b48164c727ceb5a7366185efa13a1))

## [1.0.1-alpha.126](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.125...v1.0.1-alpha.126) (2024-02-06)

### Bug Fixes

- **rpc:** wrong ESM import ([1426627](https://github.com/deepkit/deepkit-framework/commit/14266273c30414513aed4ae7667697f19d852098))

## [1.0.1-alpha.125](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.124...v1.0.1-alpha.125) (2024-02-05)

### Bug Fixes

- **mongo:** export error symbols ([5841a5a](https://github.com/deepkit/deepkit-framework/commit/5841a5a35927bf34d4187d047e43e2ec6317beb3))

## [1.0.1-alpha.124](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.123...v1.0.1-alpha.124) (2024-02-04)

### Bug Fixes

- **desktop-ui:** -webkit-scrollbar is not supported in chrome anymore ([68fca4f](https://github.com/deepkit/deepkit-framework/commit/68fca4f393d170e2ce5b4bfa17539d06d6ab1cb0))
- **desktop-ui:** dont ignore dist/ in npm package ([e6e6faa](https://github.com/deepkit/deepkit-framework/commit/e6e6faa77f2e30d741dfe0bf77a0d79c5410a7dd))
- **orm:** make sure getJoin operates on existing join model ([03b2428](https://github.com/deepkit/deepkit-framework/commit/03b242832adac48b7163e1fcf8902e7f1b197e8a))
- **type:** handle more circular types ([5f6bd12](https://github.com/deepkit/deepkit-framework/commit/5f6bd124aaf9c546014b81dbded8110312f4e819)), closes [#477](https://github.com/deepkit/deepkit-framework/issues/477)

### Features

- **orm:** better Error handling + UniqueConstraintFailure ([f1845ee](https://github.com/deepkit/deepkit-framework/commit/f1845ee84eb61a894155944a6efae6b926a4a47d))
- **orm:** new API to configure a join query ([64cc55e](https://github.com/deepkit/deepkit-framework/commit/64cc55e812a6be555515e036de4e6b18d147b4f0))

## [1.0.1-alpha.123](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.122...v1.0.1-alpha.123) (2024-02-02)

### Bug Fixes

- **desktop-ui:** resolve various circular imports ([3f5c676](https://github.com/deepkit/deepkit-framework/commit/3f5c676f49678361707be5334222a08efdde65ba))
- **injector:** resolve deps of exported providers correctly ([c185b38](https://github.com/deepkit/deepkit-framework/commit/c185b383c3314f08c92b65c76776864a2065a2b8))

### Features

- **orm:** onDatabaseError event ([cdb7256](https://github.com/deepkit/deepkit-framework/commit/cdb7256b34f1d9de16145dd79b307ccf45f7c72f))

## [1.0.1-alpha.122](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.121...v1.0.1-alpha.122) (2024-01-31)

### Features

- **injector:** new Module.configureProvider<T>(Fn) with configuration callback ([1739b95](https://github.com/deepkit/deepkit-framework/commit/1739b9564dcf4d254dd3041dc71945290e06ad4c))

## [1.0.1-alpha.121](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.120...v1.0.1-alpha.121) (2024-01-31)

### Bug Fixes

- **core:** clear timeouts correctly in ProcessLock ([89cd2d5](https://github.com/deepkit/deepkit-framework/commit/89cd2d5631e09555562a2a25d1c098f70406a469))
- **sqlite:** correctly quote column renaming ([e555ac8](https://github.com/deepkit/deepkit-framework/commit/e555ac8992e9f4ebbbf49f4c88f5e9df05954eef))
- **topsort:** circular reference detection ([1c01cc1](https://github.com/deepkit/deepkit-framework/commit/1c01cc1794ebece3b5633eee3957dcc81d16228d))

### Features

- **broker:** `await using BrokerLockItem.hold()` for better resource management ([7917fb1](https://github.com/deepkit/deepkit-framework/commit/7917fb14a58a7c0a211107ddd34746e8ffafb9fd))
- **http:** allow using unknown/any/never types that are nominal ([3221ff0](https://github.com/deepkit/deepkit-framework/commit/3221ff05ad2a2d426aa8da24c94678a672942831))

## [1.0.1-alpha.120](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.119...v1.0.1-alpha.120) (2024-01-29)

### Features

- **mysql:** upgrade mariadb dependency to 3.2.3 ([558ca17](https://github.com/deepkit/deepkit-framework/commit/558ca17cd7c3f8b22f7fcba2ebfe7e5569097fda))
- **sql:** support more union types and add new performance abstraction ([03067fa](https://github.com/deepkit/deepkit-framework/commit/03067fae3490603e1cb5ee28abd95521caeea24b)), closes [#525](https://github.com/deepkit/deepkit-framework/issues/525)
- **type:** preserve modifiers in homomorphic mapped types ([f2091d0](https://github.com/deepkit/deepkit-framework/commit/f2091d0beeb7360d0bdcc7475d0c88e53dee5de2)), closes [#515](https://github.com/deepkit/deepkit-framework/issues/515) [#514](https://github.com/deepkit/deepkit-framework/issues/514)

## [1.0.1-alpha.119](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.118...v1.0.1-alpha.119) (2024-01-28)

### Features

- **sql:** support embedded union object literals ([29da45c](https://github.com/deepkit/deepkit-framework/commit/29da45cd45c809d7b0ce029392c20d30b8260a9f))
- **type:** provide parent types in serializer template state ([d65dfc0](https://github.com/deepkit/deepkit-framework/commit/d65dfc0f80ee429e1f74af05e3a3fda385855ce5))

## [1.0.1-alpha.118](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.117...v1.0.1-alpha.118) (2024-01-27)

### Features

- **app:** support Reference in cli object flags ([b436af2](https://github.com/deepkit/deepkit-framework/commit/b436af264ae7e06860c93f1d834eb3164cfb51a5))
- **framework:** support multi-host broker setup ([6daa19e](https://github.com/deepkit/deepkit-framework/commit/6daa19e379edde04d08e7e9404fbc8cfa7ecc114))

## [1.0.1-alpha.117](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.116...v1.0.1-alpha.117) (2024-01-26)

### Bug Fixes

- **broker:** invalid type in Bus.publish ([fb99dbe](https://github.com/deepkit/deepkit-framework/commit/fb99dbe06cc6f7b56486a3d5a59ecbed319bb401))
- **type-compiler:** embed external class/functions ([ad6973d](https://github.com/deepkit/deepkit-framework/commit/ad6973dfbe32f9399ceabb39b6499255287cdb22))
- **type-compiler:** merge compilerOptions from ConfigResolver ([7b00789](https://github.com/deepkit/deepkit-framework/commit/7b0078913e5ab381c23dc807fcc86648777ff096))
- **type-compiler:** pattern match exclusion for globs ([#543](https://github.com/deepkit/deepkit-framework/issues/543)) ([30e3319](https://github.com/deepkit/deepkit-framework/commit/30e331942978e528fb5ae3cda2a37541748f562b))
- **type:** correct type guard ([272cff9](https://github.com/deepkit/deepkit-framework/commit/272cff92292043c4b76bd61bc4abe3c9a63509c9))

### Features

- **app:** allow object literals as flags ([488247a](https://github.com/deepkit/deepkit-framework/commit/488247aae86ef77950d28784bf6bf71f63b7da0e))
- **app:** allow passing command function without name ([6796414](https://github.com/deepkit/deepkit-framework/commit/67964145bede869afc88f2e9885334d9a847b755))
- **app:** more color in CLI validation error ([9231b7c](https://github.com/deepkit/deepkit-framework/commit/9231b7cb27b00b89f4badd007e23792814419c82))
- **http:** support non-class types as DI tokens in route actions ([a296570](https://github.com/deepkit/deepkit-framework/commit/a296570e015df1d3b5539ec66ea5723843178c1b))
- **type-compiler:** improve perf by 10x ([6eb0436](https://github.com/deepkit/deepkit-framework/commit/6eb0436c67c11e69c4f694ed9c6ab931c6d840de))
- **type-compiler:** support local export syntax + improve logging ([993cffa](https://github.com/deepkit/deepkit-framework/commit/993cffaa822a76963ed5185d8b1d0a7c1de28069))

## [1.0.1-alpha.116](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.115...v1.0.1-alpha.116) (2024-01-22)

### Features

- **injector:** throw error when both forRoot and exports are used in module ([#539](https://github.com/deepkit/deepkit-framework/issues/539)) ([7faa60d](https://github.com/deepkit/deepkit-framework/commit/7faa60da2a9351253ba65340add99451cbdb6594))
- **type:** refactor typeName embedding ([48a2994](https://github.com/deepkit/deepkit-framework/commit/48a29944064d03d108988949a1ff5b6e42395b57))

## [1.0.1-alpha.115](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.114...v1.0.1-alpha.115) (2024-01-21)

### Bug Fixes

- **create-app:** update code to newest deepkit version ([7f85620](https://github.com/deepkit/deepkit-framework/commit/7f856206c77b724ff0d0c326d8b6ced3c22043c0))
- **framework:** stopwatch store last sync report error ([bc15c06](https://github.com/deepkit/deepkit-framework/commit/bc15c06bdb8c620c0553a41e483c07b55c390852))
- **rpc-tcp:** make sure unixsocket folder is created ([00fd4ed](https://github.com/deepkit/deepkit-framework/commit/00fd4ed43a098e15e8fc922c138bdc9df932908b))
- **website:** add [@latest](https://github.com/latest) to npm init ([f182de5](https://github.com/deepkit/deepkit-framework/commit/f182de57040726c813bccaf7a2ee728ae0c2bd91))

## [1.0.1-alpha.114](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.113...v1.0.1-alpha.114) (2024-01-21)

### Bug Fixes

- **http:** make sure HttpHeader options is defined ([ea251ed](https://github.com/deepkit/deepkit-framework/commit/ea251ed2c6a2500633ec8d5c1593c29887e31868))
- **type-compiler:** support nodenext/node16 module type ([5e40fae](https://github.com/deepkit/deepkit-framework/commit/5e40faef6c72687853cdd877c1d4b0d98756e3ab))

### Features

- **type-compiler:** improve performance drastically ([1d80c1a](https://github.com/deepkit/deepkit-framework/commit/1d80c1a44f8ff0b3f07bc801992ce570cb4f5962))

## [1.0.1-alpha.113](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.112...v1.0.1-alpha.113) (2024-01-17)

### Bug Fixes

- **framework:** make sure profiler is only activated when debug/profile is true. ([c1d9357](https://github.com/deepkit/deepkit-framework/commit/c1d9357dba3b0a5568592fd5d61c8853bfe9b25e))

### Features

- **orm:** remove rxjs dependency ([0d9dfe1](https://github.com/deepkit/deepkit-framework/commit/0d9dfe1f80bfc34bfa12a4ffaa2fd203865d942b))

## [1.0.1-alpha.112](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.111...v1.0.1-alpha.112) (2024-01-16)

### Bug Fixes

- **framework:** make sure configured var/debug folder is created when ([3383504](https://github.com/deepkit/deepkit-framework/commit/3383504b3375d03d9f0f421e19f16e0ebc6721ae))

### Features

- **app:** improve CLI outputs/parsing by removing [@oclif](https://github.com/oclif) ([e38bbd1](https://github.com/deepkit/deepkit-framework/commit/e38bbd143daa2c856c57eca07a4fd29e884fe97e))
- **rpc:** make kernel connection available in kernel security ([#536](https://github.com/deepkit/deepkit-framework/issues/536)) ([32252b0](https://github.com/deepkit/deepkit-framework/commit/32252b0c1327ec093215602c936d287c20f0a66e))

## [1.0.1-alpha.111](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.110...v1.0.1-alpha.111) (2024-01-15)

### Features

- **type:** add new fast path to resolveReceiveType and made it 5x faster on average use case. ([45d656c](https://github.com/deepkit/deepkit-framework/commit/45d656ccc0e4ba36fe362784e60ca58c6b2da31d))

## [1.0.1-alpha.110](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.109...v1.0.1-alpha.110) (2024-01-11)

### Bug Fixes

- **type-compiler:** make sure plugin is exported in new entrypoint + deps are correct ([22eb296](https://github.com/deepkit/deepkit-framework/commit/22eb296d0001c59ca6c6c928d5834f4329f394d0))

## [1.0.1-alpha.109](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.108...v1.0.1-alpha.109) (2024-01-10)

### Bug Fixes

- **bson:** tests ([607d369](https://github.com/deepkit/deepkit-framework/commit/607d3693a12deafd97c3f12e3b61a0985e6de76c))
- **create-app:** add missing filesystem dependency ([#533](https://github.com/deepkit/deepkit-framework/issues/533)) ([a70327c](https://github.com/deepkit/deepkit-framework/commit/a70327c8d936e3b184f5eb542c5df60f59f32437))
- **http:** use default values of route parameters if no http value was provided. ([fa74d16](https://github.com/deepkit/deepkit-framework/commit/fa74d166d5421f8459f64c9b2339b9cf272a1b18)), closes [#529](https://github.com/deepkit/deepkit-framework/issues/529)
- **injector:** allow to define scope in provide<T>({}) ([2f12c2e](https://github.com/deepkit/deepkit-framework/commit/2f12c2eba63cbe2bc1286c8b507045e34c0abbd3))
- **orm:** snapshot type `any` correctly ([4898e9b](https://github.com/deepkit/deepkit-framework/commit/4898e9bc067b655284b08aa7e9a75b0bffedcbf6))
- **rpc:** defer resolving class name ([68fe2a9](https://github.com/deepkit/deepkit-framework/commit/68fe2a9e7bef13462bd304d0d4b55f3afec1b5db))
- **rpc:** tests with controller path resolution based on reflection ([6909fa8](https://github.com/deepkit/deepkit-framework/commit/6909fa846a7880feeecf0323e5e507ba8f929a72))
- **sql:** serialize referenced types ([#528](https://github.com/deepkit/deepkit-framework/issues/528)) ([2f68991](https://github.com/deepkit/deepkit-framework/commit/2f689914f1ed0b6055289f1244a60cab0386c10e))
- **type-compiler:** arrow function receive type ([#521](https://github.com/deepkit/deepkit-framework/issues/521)) ([6bfb246](https://github.com/deepkit/deepkit-framework/commit/6bfb2466753bb99020d8f429097ad1cb3520e500))
- **type-compiler:** resolve reflection mode paths correctly ([acb2d72](https://github.com/deepkit/deepkit-framework/commit/acb2d72f242a742fe99fdcf9fba892faea701e08))
- **type-compiler:** set ts compiler options target to es2022 if higher than es20222 when resolving global lib files ([#516](https://github.com/deepkit/deepkit-framework/issues/516)) ([29a1a17](https://github.com/deepkit/deepkit-framework/commit/29a1a17c0092c6304497c28184d8c5b8790b35e5))
- **type:** make serializer API consistent ([5870005](https://github.com/deepkit/deepkit-framework/commit/587000526c1ca59e28eea3b107b882151aedb08b))

### Features

- **broker:** queue message deduplication ([#512](https://github.com/deepkit/deepkit-framework/issues/512)) ([2a8bf2c](https://github.com/deepkit/deepkit-framework/commit/2a8bf2cb2b50184cbe8d0134ec9047d80270f9ce))
- **injector:** add support for receive type in isProvided ([#511](https://github.com/deepkit/deepkit-framework/issues/511)) ([e405ed3](https://github.com/deepkit/deepkit-framework/commit/e405ed31e65fee1ab50fa752863cd3eb6b08f70f))
- **mongo,sql:** skip database field for inserts ([#527](https://github.com/deepkit/deepkit-framework/issues/527)) ([9fca388](https://github.com/deepkit/deepkit-framework/commit/9fca388be5efa03727a4f7e9b485dce572a66a51))

## [1.0.1-alpha.108](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.107...v1.0.1-alpha.108) (2023-11-21)

### Bug Fixes

- **app:** correctly end stopwatch frame ([86be2e1](https://github.com/deepkit/deepkit-framework/commit/86be2e11eef5e56da223fafbe1333d0aaa68bc35))
- **broker:** await disconnect ([0568378](https://github.com/deepkit/deepkit-framework/commit/056837833424d384bb3c9f43b44a787b70d0128d))
- **core:** make sure stringifyValueWithType does not print unlimited depth ([56fbef9](https://github.com/deepkit/deepkit-framework/commit/56fbef908eb5e0c4d4c244123637182bb94f7145))
- **framework:** don't enable profiler per default ([52a7e52](https://github.com/deepkit/deepkit-framework/commit/52a7e5216b8679c8ff7825979d12b00f7e9ad869))
- **framework:** dont throw when profiler package couldn't be built. ([3b165d6](https://github.com/deepkit/deepkit-framework/commit/3b165d69d91be1c86d9a9e09770411f5fbdc66c5))
- **framework:** provide always DebugBroker ([1b55b65](https://github.com/deepkit/deepkit-framework/commit/1b55b65b0f5105c4a555e95b5b166dbad0a3ae11))
- **http:** fix tests to reflect new error reporting ([1eb83ff](https://github.com/deepkit/deepkit-framework/commit/1eb83ff2ba669fc9410269023e23b863c44e4257))
- **injector:** make sure type cache is used when finding matching provider. ([8c79e4b](https://github.com/deepkit/deepkit-framework/commit/8c79e4b1d370c21f12c203a786608b6d39dc5c56))
- **rpc:** correctly load controller name ([9d603db](https://github.com/deepkit/deepkit-framework/commit/9d603dbf752cfe5335d2c89c4c785a23e8400e0e))
- **rpc:** race condition in disconnect() when connect is still in progress ([f2d708d](https://github.com/deepkit/deepkit-framework/commit/f2d708dfa0dbcfde218aaeea864eb323291ea45a))
- **template:** better typings to support `<element role="string">` ([efb1668](https://github.com/deepkit/deepkit-framework/commit/efb1668218ec98cb0b5436a4530126bf235c79cf))
- **type:** correctly check `X extends Date` and print validation errors with caused value. ([fde795e](https://github.com/deepkit/deepkit-framework/commit/fde795ee6998606b0791f936a25ee85921c6586a))
- **type:** correctly materialize Promise in runtime checks. ([aa66460](https://github.com/deepkit/deepkit-framework/commit/aa66460f9b125a7070645f64f34a5574cd9eb549)), closes [#495](https://github.com/deepkit/deepkit-framework/issues/495)
- **type:** make sure `typeof x` expression doesn't return the original type ([7206e7e](https://github.com/deepkit/deepkit-framework/commit/7206e7ef9c3728e2b60d9a6cd7ecdb167fca78d0))
- **type:** make sure inline returns a ref to the correct type program ([dc5d6dd](https://github.com/deepkit/deepkit-framework/commit/dc5d6ddf36cc8835d7b11684a004f247900ec65f))

### Features

- **rpc:** make controller decorator name optional ([#491](https://github.com/deepkit/deepkit-framework/issues/491)) ([525ed39](https://github.com/deepkit/deepkit-framework/commit/525ed39157334bab05c923fa9de6426d1c496d29))
- **type-compiler:** emit typeName for type only imports ([#501](https://github.com/deepkit/deepkit-framework/issues/501)) ([318d091](https://github.com/deepkit/deepkit-framework/commit/318d091b9418df0a77f85de18d37541c3f9e3428))

## [1.0.1-alpha.107](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.106...v1.0.1-alpha.107) (2023-10-23)

**Note:** Version bump only for package root

## [1.0.1-alpha.106](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.105...v1.0.1-alpha.106) (2023-10-23)

**Note:** Version bump only for package root

## [1.0.1-alpha.105](https://github.com/deepkit/deepkit-framework/compare/v1.0.1-alpha.103...v1.0.1-alpha.105) (2023-10-23)

### Bug Fixes

- **filesystem-aws-s3:** use new type for ACL ([dd08c77](https://github.com/deepkit/deepkit-framework/commit/dd08c77c766d12bd52cc3f551ab65b4409c08891))
- **framework:** support esm environment for debug gui http routes ([5cb33cf](https://github.com/deepkit/deepkit-framework/commit/5cb33cfd7b98c3549ff30c42980c3d6e8f65a447))
- **mongo:** also check connection request for queued requests. ([6c6ca94](https://github.com/deepkit/deepkit-framework/commit/6c6ca94571775897edc62cd8dfa0d407b9695a98))
- **mongo:** fix off by one error in pool ([666ba86](https://github.com/deepkit/deepkit-framework/commit/666ba8614054db7deaf61fed195538e25fcee516))
- **orm:** correctly instantiate database class per module ([1ea2418](https://github.com/deepkit/deepkit-framework/commit/1ea24186232c73412bea8490f4b2eb4c30511122))
- **rpc:** move controllerAccess to handleAction to not call it twice. ([c68308d](https://github.com/deepkit/deepkit-framework/commit/c68308de9c28f8f72bc65c7e25fb08d6555f1383))
- **type-compiler:** wrong import ([caad2b3](https://github.com/deepkit/deepkit-framework/commit/caad2b39972d284e4eab9a8cedf9c3e95997c789))
- **type:** do not interfere with type checking when intersecting multiple type annotations. ([af85f1f](https://github.com/deepkit/deepkit-framework/commit/af85f1ff48c4be9fbd9a2ecd46e7f97b0bbb28c7))
- **type:** test ([c335466](https://github.com/deepkit/deepkit-framework/commit/c3354667f996586964643d561687ed246901091c))

```

```
