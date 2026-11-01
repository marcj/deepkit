# Deepkit App

Deepkit App 추상화는 Deepkit 애플리케이션의 가장 기본적인 구성 요소입니다. 라이브러리를 단독으로 사용하지 않는다면, 보통 이곳에서 애플리케이션 구축을 시작합니다.
이것은 Node.js와 같은 런타임으로 실행하는 일반적인 TypeScript 파일입니다. 애플리케이션의 진입점(entry point)이며 CLI 명령어, 서비스,
설정, 이벤트 등을 정의하는 방법을 제공합니다.

Command-line Interface(CLI) 프로그램은 텍스트 입력과 텍스트 출력의 형태로 터미널을 통해 상호작용하는 프로그램입니다. 이러한 방식으로 애플리케이션과 상호작용할 때의 장점은
로컬 또는 SSH 연결을 통해 터미널만 존재하면 된다는 것입니다.

제공하는 기능:

- CLI 명령어
- 모듈 시스템
- 서비스 컨테이너
- 의존성 주입(Dependency injection)
- 이벤트 시스템
- Logger
- 설정 로더(env, dotenv, json)

Deepkit의 명령어는 DI 컨테이너에 대한 완전한 접근 권한을 가지므로 모든 provider와 설정 옵션에 접근할 수 있습니다. CLI 명령어의 인자(argument)와 옵션은
TypeScript 타입을 통한 Parameter 선언으로 제어되며, 자동으로 직렬화되고 검증됩니다.

`@deepkit/framework`를 사용하는 [Deepkit Framework](./framework.md)는 HTTP/RPC를 위한 애플리케이션 서버, 디버거/프로파일러 등으로 이를 더욱 확장합니다.

예제:

```typescript
import { App, Flag } from '@deepkit/app';
import { Database } from './database';

const app = new App({
    providers: [Database]
});

async function testCommand(
    name: string, // CLI 인자
    age: number & Flag, // CLI 플래그
    database: Database, // 의존성 주입
) {
    console.log(`Hello ${name}!`);
    const users = await database.query<User>().find();
}

app.command('test', testCommand);

void app.run();
```

```sh
ts-node app.ts test John --age 42
```

## 간편 설치

가장 쉽게 시작하는 방법은 NPM init을 사용하여 새로운 Deepkit 프로젝트를 생성하는 것입니다.

```shell
npm init @deepkit/app@latest my-deepkit-app
````

이렇게 하면 모든 의존성과 기본 `app.ts` 파일이 포함된 새 폴더 `my-deepkit-app`이 생성됩니다.

```sh
cd my-deepkit-app
npm run app
````

이 명령은 `ts-node`로 `app.ts` 파일을 실행하고 사용 가능한 명령어를 보여줍니다. 여기서부터 시작하여 자신만의 명령어, 컨트롤러 등을 추가할 수 있습니다.

## 수동 설치

Deepkit App은 [Deepkit Runtime Types](./runtime-types.md)를 기반으로 하므로, 모든 의존성을 설치해 보겠습니다:

```bash
mkdir my-project && cd my-project

npm install typescript ts-node 
npm install @deepkit/app @deepkit/type @deepkit/type-compiler
```

다음으로, 아래 명령어를 실행하여 Deepkit의 타입 컴파일러가 `node_modules/typescript`에 설치된 TypeScript 패키지에 설치되도록 합니다:

```sh
./node_modules/.bin/deepkit-type-install
```

모든 peer dependency가 설치되어 있는지 확인하세요. 기본적으로 NPM 7+는 이를 자동으로 설치합니다.

애플리케이션을 컴파일하려면 TypeScript 컴파일러가 필요하며, 앱을 쉽게 실행하기 위해 `ts-node`를 권장합니다.

`ts-node`를 사용하는 대신 TypeScript 컴파일러로 소스 코드를 컴파일하고 JavaScript 소스 코드를 직접 실행하는 방법도 있습니다. 이 방법은 짧은 명령어의 실행 속도를
극적으로 높일 수 있다는 장점이 있습니다. 하지만 컴파일러를 수동으로 실행하거나 watcher를 설정해야 하므로 추가적인 워크플로 오버헤드가 발생합니다. 이러한
이유로 이 문서의 모든 예제에서는 `ts-node`를 사용합니다.

## 첫 번째 애플리케이션

Deepkit 프레임워크는 설정 파일이나 특별한 폴더 구조를 사용하지 않으므로, 프로젝트를 원하는 대로 구성할 수 있습니다. 시작하는 데 필요한 파일은
TypeScript app.ts 파일과 TypeScript 설정 파일인 tsconfig.json 두 개뿐입니다.

우리의 목표는 프로젝트 폴더에 다음과 같은 파일을 갖추는 것입니다:

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

이 코드에서 test 명령어를 정의하고 새 앱을 생성한 뒤 `run()`을 사용하여 직접 실행하는 것을 볼 수 있습니다. 이 스크립트를 실행하면 앱이 시작됩니다.

그런 다음 직접 실행합니다.

```sh
$ ./node_modules/.bin/ts-node app.ts
VERSION
  Node

USAGE
  $ ts-node app.ts [COMMAND]

COMMANDS
  test
```

이제 test 명령어를 실행하기 위해 다음 명령어를 실행합니다.

```sh
$ ./node_modules/.bin/ts-node app.ts test
Hello World
```

이제 Deepkit에서는 모든 것이 이 `app.ts`를 통해 이루어집니다. 파일 이름을 원하는 대로 변경하거나 더 많은 파일을 만들 수 있습니다. 사용자 정의 CLI 명령어, HTTP/RPC 서버, 마이그레이션 명령어 등은 모두
이 진입점에서 시작됩니다.

## 인자 & 플래그

Deepkit App은 함수 Parameter를 자동으로 CLI 인자와 플래그로 변환합니다. Parameter의 순서가 CLI 인자의 순서를 결정합니다.

Parameter는 어떤 TypeScript 타입이든 될 수 있으며 자동으로 검증되고 역직렬화됩니다.

자세한 내용은 [인자 & 플래그](./app/arguments.md) 장을 참조하세요.

## 의존성 주입

Deepkit App은 서비스 컨테이너를 설정하며, 가져온(import) 각 모듈마다 부모로부터 상속받는 자체 의존성 주입 컨테이너를 설정합니다.
서비스, 컨트롤러, 이벤트 리스너에 자동으로 주입할 수 있는 다음과 같은 provider를 기본으로 제공합니다:

- 로깅을 위한 `Logger`
- 이벤트 처리를 위한 `EventDispatcher`
- 등록된 CLI 명령어를 위한 `CliControllerRegistry`
- 등록된 미들웨어를 위한 `MiddlewareRegistry`
- 현재 injector 컨텍스트를 위한 `InjectorContext`

Deepkit Framework를 가져오면 추가적인 provider를 얻을 수 있습니다. 자세한 내용은 [Deepkit Framework](./framework.md)를 참조하세요.

## 종료 코드

종료 코드는 기본적으로 0이며, 이는 명령어가 성공적으로 실행되었음을 의미합니다. 종료 코드를 변경하려면 execute Method 또는 명령어 콜백에서 0이 아닌 숫자를 반환해야 합니다.

```typescript

@cli.controller('test')
export class TestCommand {
    async execute() {
        console.error('Error :(');
        return 12;
    }
}
```
