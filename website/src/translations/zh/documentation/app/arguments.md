# 参数与 Flag

命令在终端中的参数就是 `execute` 方法或函数的普通参数，它们会自动映射到命令行参数。
如果将某个参数标记为可选，则无需传递它。如果参数有默认值，同样无需传递。

根据类型（string、number、union 等）的不同，传入的值会被自动反序列化并验证。

```typescript
import { cli } from '@deepkit/app';

//函数式
new App().command('test', (name: string) => {
    console.log('Hello', name);
});

//类
@cli.controller('test')
class TestCommand {
    async execute(name: string) {
        console.log('Hello', name);
    }
}
```

如果现在执行此命令而不指定 name 参数，将会报错：

```sh
$ ts-node app.ts test
RequiredArgsError: Missing 1 required arg:
name
```

使用 `--help` 可以获取有关必需参数的更多信息：

```sh
$ ts-node app.ts test --help
USAGE
  $ ts-node-script app.ts test NAME
```

一旦将 name 作为参数传入，命令就会被执行，并且 name 会被正确传递。

```sh
$ ts-node app.ts test "beautiful world"
Hello beautiful world
```

每种原始参数类型，例如 string、number、boolean、字符串字面量、它们的 union 以及它们的数组，都会自动用作 CLI 参数，
并被自动验证和反序列化。参数的顺序决定了 CLI 参数的顺序。你可以添加任意数量的参数。

一旦定义了复杂对象（interface、class、对象字面量），它就会被视为服务依赖，
依赖注入容器会尝试解析它。更多信息请参阅 [依赖注入](dependency-injection.md) 章节。

### 多个值

类型为数组的参数会接收所有剩余的位置参数。每个值都会根据元素类型进行反序列化和验证。
数组之后的参数会保留各自的值，因此像 `cp <files...> <target>` 这样的命令可以按预期工作。

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

必需的数组参数至少需要一个值。如果有默认值，例如 `ids: number[] = []`，则它是可选的。

## Flag

Flag 是向命令传递值的另一种方式。它们大多是可选的，但并非必须如此。使用 `Flag` 类型修饰的参数可以通过 `--name value` 或 `--name=value` 传递。

```typescript
import { Flag } from '@deepkit/app';

//函数式
new App().command('test', (id: number & Flag) => {
    console.log('id', name);
});

//类
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

在帮助视图的 "OPTIONS" 中可以看到，`--id` flag 是必需的。如果正确输入此 flag，命令将接收到该值。

```sh
$ ts-node app.ts test --id 23
id 23

$ ts-node app.ts test --id=23
id 23
```

### Boolean Flag

Flag 的优点在于它们也可以用作无值 flag，例如用于激活某种行为。一旦参数被标记为可选的 Boolean，就会启用此行为。

```typescript
import { Flag } from '@deepkit/app';

//函数式
new App().command('test', (remove: boolean & Flag = false) => {
    console.log('delete?', remove);
});

//类
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

### 多个 Flag

要向同一个 flag 传递多个值，可以将 flag 标记为数组。

```typescript
import { Flag } from '@deepkit/app';

//函数式
new App().command('test', (id: number[] & Flag = []) => {
    console.log('ids', id);
});

//类
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

### 单字符 Flag

要允许 flag 也以单个字符的形式传递，可以使用 `Flag<{char: 'x'}>`。

```typescript
import { Flag } from '@deepkit/app';

//函数式
new App().command('test', (output: string & Flag<{char: 'o'}>) => {
    console.log('output: ', output);
});

//类
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

## 可选 / 默认值

方法/函数的签名定义了哪些参数或 flag 是可选的。如果参数在类型系统中是可选的，用户就不必提供它。

```typescript

//函数式
new App().command('test', (name?: string) => {
    console.log('Hello', name || 'nobody');
});

//类
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

带有默认值的参数也是如此：

```typescript
//函数式
new App().command('test', (name: string = 'body') => {
    console.log('Hello', name);
});

//类
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

这同样适用于 flag。


## 序列化 / 验证

所有参数和 flag 都会根据其类型自动反序列化、验证，并且可以附加额外的约束。

因此，即使命令行界面基于文本（即字符串），定义为 number 的参数在控制器中也始终保证是真正的数字。

```typescript
//函数式
new App().command('test', (id: number) => {
    console.log('id', id, typeof id);
});

//类
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

可以使用 `@deepkit/type` 中的类型注解定义额外的约束。

```typescript
import { Positive } from '@deepkit/type';
//函数式
new App().command('test', (id: number & Positive) => {
    console.log('id', id, typeof id);
});

//类
class TestCommand {
    async execute(id: number & Positive) {
        console.log('id', id, typeof id);
    }
}
```

`id` 中的 `Postive` 类型表示只允许正数。如果用户现在传入负数，代码将根本不会执行，并会显示一条错误信息。

```sh
$ ts-node app.ts test -123
Validation error in id: Number needs to be positive [positive]
```

这种非常容易实现的额外验证，使命令在面对错误输入时更加健壮。更多信息请参阅 [验证](../runtime-types/validation.md) 章节。

## 描述

要描述 flag 或参数，请使用 `@description` 注释装饰器。

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

在帮助视图中，此描述会显示在 flag 或参数之后：

```sh
$ ts-node app.ts test --help
USAGE
  $ ts-node app.ts test ID

ARGUMENTS
  ID  The users identifier

OPTIONS
  --remove  Delete the user?
```
