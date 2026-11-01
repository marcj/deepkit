# Arguments & Flags

터미널에서 명령의 command arguments는 `execute` 메서드나 함수의 일반적인 인자일 뿐입니다. 이들은 자동으로 커맨드 라인 인자에 매핑됩니다.
파라미터를 optional로 표시하면 전달하지 않아도 됩니다. 기본값이 있는 경우에도 전달하지 않아도 됩니다.

타입(string, number, union 등)에 따라 전달된 값은 자동으로 역직렬화되고 검증됩니다.

```typescript
import { cli } from '@deepkit/app';

//functional
new App().command('test', (name: string) => {
    console.log('Hello', name);
});

//class
@cli.controller('test')
class TestCommand {
    async execute(name: string) {
        console.log('Hello', name);
    }
}
```

이제 name 파라미터를 지정하지 않고 이 명령을 실행하면 에러가 발생합니다:

```sh
$ ts-node app.ts test
RequiredArgsError: Missing 1 required arg:
name
```

`--help`를 사용하면 필수 인자에 대한 더 많은 정보를 얻을 수 있습니다:

```sh
$ ts-node app.ts test --help
USAGE
  $ ts-node-script app.ts test NAME
```

name을 인자로 전달하면 명령이 실행되고 name이 올바르게 전달됩니다.

```sh
$ ts-node app.ts test "beautiful world"
Hello beautiful world
```

string, number, boolean, string literal, 이들의 union, 그리고 이들의 배열과 같은 모든 primitive 파라미터 타입은 자동으로 CLI 인자로 사용되며
자동으로 검증되고 역직렬화됩니다. 파라미터의 순서가 CLI 인자의 순서를 결정합니다. 원하는 만큼 파라미터를 추가할 수 있습니다.

복잡한 객체(interface, class, object literal)가 정의되는 즉시, 이는 서비스 의존성으로 취급되며
Dependency Injection Container가 이를 resolve하려고 시도합니다. 자세한 내용은 [Dependency Injection](dependency-injection.md) 챕터를 참조하세요.

### 여러 값

배열로 타입이 지정된 인자는 나머지 모든 위치 인자를 받습니다. 각 값은 요소 타입에 맞게 역직렬화되고 검증됩니다.
배열 뒤에 오는 인자는 자신의 값을 유지하므로, `cp <files...> <target>`과 같은 명령이 예상대로 동작합니다.

```typescript
new App().command('copy', (files: string[], target: string) => {
    console.log('copy', files, 'to', target);
});

new App().command('delete', (ids: number[]) => {
    console.log('delete', ids);
});
```

```sh
$ ts-node app.ts copy a.txt b.txt backup/
copy [ 'a.txt', 'b.txt' ] to backup/

$ ts-node app.ts delete 1 2 3
delete [ 1, 2, 3 ]

$ ts-node app.ts delete 1 two
Invalid value for argument ids: 1,two. Cannot convert two to number [type]
```

필수 배열 인자는 최소 하나의 값이 필요합니다. `ids: number[] = []`처럼 기본값이 있으면 optional이 됩니다.

## Flags

Flag는 명령에 값을 전달하는 또 다른 방법입니다. 대부분 optional이지만 반드시 그럴 필요는 없습니다. `Flag` 타입으로 데코레이트된 파라미터는 `--name value` 또는 `--name=value`로 전달할 수 있습니다.

```typescript
import { Flag } from '@deepkit/app';

//functional
new App().command('test', (id: number & Flag) => {
    console.log('id', name);
});

//class
class TestCommand {
    async execute(id: number & Flag) {
        console.log('id', id);
    }
}
```

```sh
$ ts-node app.ts test --help
USAGE
  $ ts-node app.ts test

OPTIONS
  --id=id  (required)
```

help 화면의 "OPTIONS"에서 `--id` flag가 필요하다는 것을 확인할 수 있습니다. 이 flag를 올바르게 입력하면 명령이 이 값을 받게 됩니다.

```sh
$ ts-node app.ts test --id 23
id 23

$ ts-node app.ts test --id=23
id 23
```

### Boolean Flags

Flag는 값이 없는 flag로도 사용할 수 있다는 장점이 있으며, 예를 들어 특정 동작을 활성화하는 데 사용할 수 있습니다. 파라미터가 optional Boolean으로 표시되는 즉시 이 동작이 활성화됩니다.

```typescript
import { Flag } from '@deepkit/app';

//functional
new App().command('test', (remove: boolean & Flag = false) => {
    console.log('delete?', remove);
});

//class
class TestCommand {
    async execute(remove: boolean & Flag = false) {
        console.log('delete?', remove);
    }
}
```

```sh
$ ts-node app.ts test
delete? false

$ ts-node app.ts test --remove
delete? true
```

### 여러 Flags

같은 flag에 여러 값을 전달하려면 flag를 배열로 표시할 수 있습니다.

```typescript
import { Flag } from '@deepkit/app';

//functional
new App().command('test', (id: number[] & Flag = []) => {
    console.log('ids', id);
});

//class
class TestCommand {
    async execute(id: number[] & Flag = []) {
        console.log('ids', id);
    }
}
```

```sh
$ ts-node app.ts test
ids: []

$ ts-node app.ts test --id 12
ids: [12]

$ ts-node app.ts test --id 12 --id 23
ids: [12, 23]
```

### 단일 문자 Flags

flag를 단일 문자로도 전달할 수 있도록 하려면 `Flag<{char: 'x'}>`를 사용할 수 있습니다.

```typescript
import { Flag } from '@deepkit/app';

//functional
new App().command('test', (output: string & Flag<{char: 'o'}>) => {
    console.log('output: ', output);
});

//class
class TestCommand {
    async execute(output: string & Flag<{char: 'o'}>) {
        console.log('output: ', output);
    }
}
```

```sh
$ ts-node app.ts test --help
USAGE
  $ ts-node app.ts test

OPTIONS
  -o, --output=output  (required)


$ ts-node app.ts test --output test.txt
output: test.txt

$ ts-node app.ts test -o test.txt
output: test.txt
```

## Optional / Default

메서드/함수의 시그니처가 어떤 인자나 flag가 optional인지를 정의합니다. 타입 시스템에서 파라미터가 optional이면 사용자는 이를 제공하지 않아도 됩니다.

```typescript

//functional
new App().command('test', (name?: string) => {
    console.log('Hello', name || 'nobody');
});

//class
class TestCommand {
    async execute(name?: string) {
        console.log('Hello', name || 'nobody');
    }
}
```

```sh
$ ts-node app.ts test
Hello nobody
```

기본값이 있는 파라미터도 마찬가지입니다:

```typescript
//functional
new App().command('test', (name: string = 'body') => {
    console.log('Hello', name);
});

//class
class TestCommand {
    async execute(name: string = 'body') {
        console.log('Hello', name);
    }
}
```

```sh
$ ts-node app.ts test
Hello nobody
```

이는 flag에도 동일하게 적용됩니다.


## 직렬화 / 검증

모든 인자와 flag는 타입에 따라 자동으로 역직렬화되고 검증되며, 추가적인 제약 조건을 지정할 수 있습니다.

따라서 커맨드 라인 인터페이스가 텍스트, 즉 문자열을 기반으로 하더라도 number로 정의된 인자는 controller에서 항상 실제 숫자임이 보장됩니다.

```typescript
//functional
new App().command('test', (id: number) => {
    console.log('id', id, typeof id);
});

//class
class TestCommand {
    async execute(id: number) {
        console.log('id', id, typeof id);
    }
}
```

```sh
$ ts-node app.ts test 123
id 123 number
```

추가적인 제약 조건은 `@deepkit/type`의 타입 어노테이션으로 정의할 수 있습니다.

```typescript
import { Positive } from '@deepkit/type';
//functional
new App().command('test', (id: number & Positive) => {
    console.log('id', id, typeof id);
});

//class
class TestCommand {
    async execute(id: number & Positive) {
        console.log('id', id, typeof id);
    }
}
```

`id`의 `Postive` 타입은 양수만 허용됨을 나타냅니다. 이제 사용자가 음수를 전달하면 코드가 전혀 실행되지 않고 에러 메시지가 표시됩니다.

```sh
$ ts-node app.ts test -123
Validation error in id: Number needs to be positive [positive]
```

매우 쉽게 적용할 수 있는 이 추가 검증은 잘못된 입력에 대해 명령을 훨씬 더 견고하게 만들어 줍니다. 자세한 내용은 [Validation](../runtime-types/validation.md) 챕터를 참조하세요.

## 설명

flag나 인자를 설명하려면 `@description` 주석 데코레이터를 사용하세요.

```typescript
import { Positive } from '@deepkit/type';

class TestCommand {
    async execute(
        /** @description The users identifier */
        id: number & Positive,
        /** @description Delete the user? */
        remove: boolean = false
    ) {
        console.log('id', id, typeof id);
    }
}
```

help 화면에서 이 설명은 flag나 인자 뒤에 표시됩니다:

```sh
$ ts-node app.ts test --help
USAGE
  $ ts-node app.ts test ID

ARGUMENTS
  ID  The users identifier

OPTIONS
  --remove  Delete the user?
```
