---
title: Deepkit ORM Browser
package: "@deepkit/orm-browser"
doc: orm/orm-browser
---

<p class="introduction">
    Data browser for Deepkit ORM. With interfaces for schema migrate and your ER model of your database.
    An interactive query prompt allows you to execute javascript queries directly in the browser
    against your real database.
</p>

## Features

<div class="app-boxes-small">
    <box title="Content editing">Change all your data from your database ORM models.</box>
    <box title="Query interface">Explore your data by using regular JavaScript query commands.</box>
    <box title="Model diagram">See all your models with relations.</box>
</div>

<feature class="center">

## Content editing

Change all your data from your database ORM models directly in your local browser. Adding, editing,
removing, change relations, filtering, sorting, and much more.

<app-image alt="content editing" src="/assets/screenshots-orm-browser/content-editing.png"></app-image>

</feature>


<feature class="center">

## Query

Explore your data by using regular JavaScript query commands like you would do
in your Typescript source.

<app-image alt="content editing" src="/assets/screenshots-orm-browser/query.png"></app-image>

</feature>


<feature class="center">

## Model Diagram

See all your models with relations, fields, and primary keys in one big diagram.

<app-image alt="content editing" src="/assets/screenshots-orm-browser/model-diagram.png"></app-image>

</feature>



<feature>

## Easy to use

You only have to provide your database as TypeScript source. No configuration files, compilation,
or anything else necessary.

Deepkit ORM Browser is enabled by default in Deepkit Framework module.


<p>
    By opening <code>http://localhost:9090/</code> you can directly start managing content.
    The ORM Browser is integrated automatically when using Deepkit Framework in its Framework Debugger.
</p>

```typescript title=database.ts
import { entity, PrimaryKey, AutoIncrement } from '@deepkit/type';
import { Database } from '@deepkit/orm';
import { SQLiteDatabaseAdapter } from '@deepkit/sqlite';

@entity.collection('groups')
export class Group {
    public id: number & PrimaryKey & AutoIncrement = 0;
    created: Date = new Date;

    constructor(
        public name: string
    ) {
    }
}

const adapter = new SQLiteDatabaseAdapter('./example.sqlite');
const database = new Database(adapter, [Group]);
```


```bash
$ deepkit-orm-browser database.ts
[LOG] Start HTTP server, using 1 workers.
[LOG] RPC OrmBrowserController orm-browser/controller
[LOG] HTTP OrmBrowserController
[LOG]     GET /_orm-browser/query httpQuery
[LOG] HTTP StaticController
[LOG]     GET /:any serviceApp
[LOG] HTTP listening at http://localhost:9090/
```


</feature>
