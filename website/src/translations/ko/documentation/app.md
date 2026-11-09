# TypeScript CLI Framework

Deepkit App은 함수 시그니처가 곧 커맨드 정의가 되는 TypeScript CLI 프레임워크입니다. Argument, 플래그, 기본값, 유효성 검사는 모두 TypeScript 타입에서 가져오므로 같은 내용을 두 번 선언할 필요가 없습니다.

```typescript title=app.ts
import { App, Flag } from '@deepkit/app';
import { Logger } from '@deepkit/logger';
import { Maximum } from '@deepkit/type';

class Greeter {
    constructor(private logger: Logger) {}

    greet(name: string) {
        this.logger.log(`Hello ${name}`);
    }
}

function greet(
    name: string,
    times: number & Maximum<5> & Flag = 1,
    greeter: Greeter,
) {
    for (let i = 0; i < times; i++) greeter.greet(name);
}

new App({ providers: [Greeter] })
    .command('greet', greet)
    .run();
```

`name`은 필수 Argument가 되고, `times`는 기본값이 1인 `--times` 플래그가 되며, `greeter`는 의존성 주입 컨테이너가 제공합니다.

```sh
$ ts-node app.ts greet Peter --times 2
Hello Peter
Hello Peter

$ ts-node app.ts greet Peter --times 9
Invalid value for option --times: 9.
Number needs to be smaller than or equal to 5

$ ts-node app.ts greet Peter --times abc
Invalid value for option --times: abc.
Cannot convert abc to number [type]

$ ts-node app.ts greet --help
Usage: ts-node app.ts greet [OPTIONS] [name]

Arguments:
  name	[required]
Options:
  --times number [default=1]
```

## Commander, Yargs, oclif와의 비교

|                        | Deepkit App                      | Commander                 | Yargs                        | oclif                     |
| ---------------------- | -------------------------------- | ------------------------- | ---------------------------- | ------------------------- |
| 옵션 정의 방식         | 커맨드의 TypeScript 타입         | `.option()` 호출          | Builder 호출                 | Class의 정적 `flags`      |
| 유효성 검사            | 타입에서 도출 (예: `Maximum<5>`) | 직접 작성한 파서 함수     | `choices`, `coerce`, `check` | 플래그 옵션과 파서        |
| 의존성 주입            | 내장                             | 없음                      | 없음                         | 없음                      |
| 설정, 모듈             | 내장                             | 없음                      | 설정 파일만 지원             | 플러그인                  |

Deepkit은 런타임에 타입을 읽기 때문에 빌드 과정에 [Deepkit 타입 컴파일러](./runtime-types/getting-started.md)가 필요합니다. 빌드 단계가 없는 작은 스크립트라면 Commander 같은 라이브러리가 더 간단한 선택입니다.

## Deepkit App에 포함된 기능

Deepkit App은 Deepkit 애플리케이션의 가장 기본적인 구성 요소이며, 라이브러리를 단독으로 사용하지 않는다면 보통 여기에서 시작합니다. Node.js 같은 런타임으로 실행하는 일반 TypeScript 파일이며, 다음 기능을 제공합니다.

- CLI 커맨드
- 모듈 시스템
- 서비스 컨테이너
- 의존성 주입
- 이벤트 시스템
- Logger
- 설정 로더 (env, dotenv, json)

커맨드는 DI 컨테이너에 대한 전체 접근 권한을 가지므로 모든 프로바이더와 설정 옵션에 접근할 수 있습니다. Deepkit 전용 전역 CLI 도구는 없습니다. HTTP/RPC 서버, 마이그레이션, 직접 작성한 커맨드는 모두 같은 파일에서 시작합니다.

`@deepkit/framework`를 사용하는 [Deepkit Framework](./framework.md)는 HTTP/RPC용 애플리케이션 서버, 디버거/프로파일러 등을 더해 이를 한층 더 확장합니다.

## 간편 설치

가장 쉽게 시작하는 방법은 NPM init으로 새 Deepkit 프로젝트를 만드는 것입니다.

```shell
npm init @deepkit/app@latest my-deepkit-app
```

이 명령은 모든 의존성과 기본 `app.ts` 파일이 포함된 새 폴더 `my-deepkit-app`을 생성합니다.

```sh
cd my-deepkit-app
npm run app
```

이 명령은 `ts-node`로 `app.ts` 파일을 실행하고 사용 가능한 커맨드를 보여 줍니다. 여기서부터 직접 커맨드, 컨트롤러 등을 추가해 나갈 수 있습니다.

## 수동 설치

Deepkit App은 [Deepkit Runtime Types](./runtime-types.md)를 기반으로 하므로 모든 의존성을 설치합니다.

```bash
mkdir my-project && cd my-project

npm install typescript ts-node 
npm install @deepkit/app @deepkit/type @deepkit/type-compiler
```

다음으로, 아래 명령을 실행하여 Deepkit의 타입 컴파일러가 `node_modules/typescript`에 설치된 TypeScript 패키지에 설치되도록 합니다.

```sh
./node_modules/.bin/deepkit-type-install
```

모든 peer dependency가 설치되어 있는지 확인하세요. NPM 7 이상에서는 기본적으로 자동 설치됩니다.

애플리케이션을 컴파일하려면 TypeScript 컴파일러가 필요하며, 앱을 쉽게 실행하기 위해 `ts-node` 사용을 권장합니다.

`ts-node`를 사용하는 대신 TypeScript 컴파일러로 소스 코드를 컴파일한 뒤 JavaScript 소스 코드를 직접 실행할 수도 있습니다. 이 방법은 짧은 커맨드의 실행 속도를 크게
높여 준다는 장점이 있습니다. 하지만 컴파일러를 수동으로 실행하거나 watcher를 설정해야 하므로 워크플로에 추가 부담이 생깁니다. 이러한
이유로 이 문서의 모든 예제에서는 `ts-node`를 사용합니다.

## 첫 번째 애플리케이션

Deepkit 프레임워크는 설정 파일이나 특별한 폴더 구조를 사용하지 않으므로 프로젝트를 원하는 대로 구성할 수 있습니다. 시작하는 데 필요한 파일은
TypeScript 파일 app.ts와 TypeScript 설정 파일 tsconfig.json 두 개뿐입니다.

프로젝트 폴더에 다음 파일들이 있도록 구성하는 것이 목표입니다.

```
.
├── app.ts
├── node_modules
├── package-lock.json
└── tsconfig.json
```

기본 tsconfig 파일을 설정하고 `reflection`을 `true`로 설정하여 Deepkit의 타입 컴파일러를 활성화합니다.
이는 의존성 주입 컨테이너와 기타 기능을 사용하는 데 필요합니다.

```json title=tsconfig.json
{
  "compilerOptions": {
    "outDir": "./dist",
    "experimentalDecorators": true,
    "strict": true,
    "esModuleInterop": true,
    "target": "es2020",
    "module": "CommonJS",
    "moduleResolution": "node"
  },
  "reflection": true,
  "files": [
    "app.ts"
  ]
}
```

```typescript title=app.ts
import { App } from '@deepkit/app';
import { Logger } from '@deepkit/logger';

const app = new App();

app.command('test', (logger: Logger) => {
    logger.log('Hello World!');
});

app.run();
```

이 코드에서는 test 커맨드를 정의하고 새 앱을 생성한 뒤 `run()`으로 바로 실행합니다. 이 스크립트를 실행하면 앱이 시작됩니다.

그런 다음 바로 실행합니다.

```sh
$ ./node_modules/.bin/ts-node app.ts
VERSION
  Node

USAGE
  $ ts-node app.ts [COMMAND]

COMMANDS
  test
```

이제 test 커맨드를 실행하려면 다음 명령을 실행합니다.

```sh
$ ./node_modules/.bin/ts-node app.ts test
Hello World
```

이제 Deepkit에서는 모든 작업이 이 `app.ts`를 통해 이루어집니다. 파일 이름은 원하는 대로 바꿀 수 있으며 더 많은 파일을 만들 수도 있습니다. 사용자 정의 CLI 커맨드, HTTP/RPC 서버, 마이그레이션 커맨드 등은 모두
이 진입점에서 시작됩니다.

## Argument와 플래그

Deepkit App은 함수 Parameter를 CLI Argument와 플래그로 자동 변환합니다. Parameter의 순서가 CLI Argument의 순서를 결정합니다.

Parameter에는 어떤 TypeScript 타입이든 사용할 수 있으며 자동으로 유효성 검사와 역직렬화가 수행됩니다.

자세한 내용은 [Argument와 플래그](./app/arguments.md) 장을 참고하세요.

## 의존성 주입

Deepkit App은 서비스 컨테이너를 설정하고, 가져온 각 모듈마다 부모로부터 상속받는 자체 의존성 주입 컨테이너를 설정합니다.
서비스, 컨트롤러, 이벤트 리스너에 자동으로 주입할 수 있는 다음 프로바이더를 기본으로 제공합니다.

- 로깅을 위한 `Logger`
- 이벤트 처리를 위한 `EventDispatcher`
- 등록된 CLI 커맨드를 위한 `CliControllerRegistry`
- 등록된 미들웨어를 위한 `MiddlewareRegistry`
- 현재 인젝터 컨텍스트를 위한 `InjectorContext`

Deepkit Framework를 가져오면 추가 프로바이더를 사용할 수 있습니다. 자세한 내용은 [Deepkit Framework](./framework.md)를 참고하세요.

## 종료 코드

종료 코드의 기본값은 0이며, 이는 커맨드가 성공적으로 실행되었음을 의미합니다. 종료 코드를 변경하려면 execute Method 또는 커맨드 콜백에서 0이 아닌 숫자를 반환해야 합니다.

```typescript
import { cli } from '@deepkit/app';

@cli.controller('test')
export class TestCommand {
    async execute() {
        console.error('Error :(');
        return 12;
    }
}
```
