import { Page } from '@app/common/models';

import frontMatterParser from 'gray-matter';
import { cast } from '@deepkit/type';
import { asyncOperation } from '@deepkit/core';

function renderText(node: any): any {
    if (typeof node === 'string') return node;
    if (typeof node === 'object')
        return Array.isArray(node.children)
            ? node.children.map((child: any) => renderText(child)).join('')
            : renderText(node.children);
    return '';
}

function getHeadings(node: any): any {
    if (node != undefined) {
        if (typeof node === 'string') {
            return [];
        }
        if (typeof node.tag === 'string') {
            const tag = node.tag;
            const level = parseInt(tag[1], 10);
            if (tag[0] === 'h' && !isNaN(level)) {
                return [
                    {
                        level,
                        text: renderText(node),
                        id: node.props && node.props.id ? String(node.props.id) : '',
                    },
                ];
            }
        }
        return (Array.isArray(node.children)
                ? node.children.reduce(
                    (acc: any, child: any) => acc.concat(getHeadings(child)),
                    [],
                )
                : getHeadings(node.children)
        ).filter((h: any) => h);
    }
    return [];
}

function extractMetaFromBodyNode(node: any): any {
    const headings = getHeadings(node);
    const firstH1 = headings.find((h: any) => h.level === 1);
    return {
        title: firstH1 ? firstH1.text : undefined,
        headings,
    };
}

const getOnlyChildren = (ast: any) => {
    // rehype-react add an outer div by default
    // lets try to remove it
    if (
        ast.tag === 'div' &&
        ast.children != undefined &&
        Array.isArray(ast.children) &&
        ast.children.length === 1 &&
        ast.children[0] != undefined
    ) {
        return ast.children[0];
    }
    return ast;
};

export class MarkdownParser {
    protected proccesor?: any;

    loading?: Promise<void>;

    load(): Promise<void> {
        if (this.loading) return this.loading;
        return this.loading = asyncOperation<void>(async (resolve) => {
            if (this.proccesor) return;
            const unified = await import('unified');
            this.proccesor = unified.unified();

            //markdown to mdast
            this.proccesor.use((await import('remark-parse')).default);

            //github flavored markdown
            this.proccesor.use((await import('remark-gfm')).default);

            //markdown to html
            this.proccesor.use((await import('remark-rehype')).default, {
                allowDangerousHtml: true, handlers: {
                    code: (state: any, node: any) => {
                        // Create `<pre>`.
                        const result = {
                            type: 'element',
                            tagName: 'pre',
                            properties: {
                                meta: node.meta,
                                className: ['language-' + (node.lang || '')],
                            },
                            children: [{ type: 'text', value: node.value || '' }],
                        };
                        state.patch(node, result);
                        return result;
                    },
                },
            });
            // this.proccesor.use(remarkCodeTitle);

            //reparse tree, so we can use html in markdown
            //@ts-ignore
            this.proccesor.use((await import('rehype-raw')).default);

            //add id to headings
            //@ts-ignore
            this.proccesor.use((await import('rehype-slug')).default);

            //convert to handy object structure
            //@ts-ignore
            this.proccesor.use((await import('rehype-react')).default, {
                createElement: (component: any, props: any, children: any) => {
                    return {
                        tag: component,
                        props: props && Object.keys(props).length ? props : undefined,
                        children,
                    };
                },
            } as any);
            resolve();
        });
    }

    async loadAndParse(content: string): Promise<Page> {
        await this.load();
        return this.parse(content);
    }

    parse(content: string): Page {
        return this.parseRaw(content);
    }

    parseRaw(content: string): Page {
        if (!this.proccesor) throw new Error('MarkdownParser not loaded.');

        const front = frontMatterParser(content);
        const processed = this.proccesor.processSync(front.content);

        if (
            processed != undefined &&
            typeof processed === 'object' &&
            processed.result != undefined &&
            typeof processed.result === 'object'
        ) {
            return cast<Page>(Object.assign(extractMetaFromBodyNode(processed.result), front.data, {
                params: front.data,
                body: getOnlyChildren(processed.result),
            }));
        }
        throw new Error('unified processSync didn\'t return an object.');
    }
}
