import { Node, NodeViewRenderer, NodeViewRendererProps } from '@tiptap/core';
import { TextEditorComponent } from './text-editor.component';
import { Decoration, DecorationSource, NodeView } from 'prosemirror-view';
import { Node as ProseNode } from 'prosemirror-model';

export interface ImageOptions {
    textEditor?: TextEditorComponent,
    inline: boolean,
    allowBase64: boolean,
    HTMLAttributes: Record<string, any>,
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        image: {
            /**
             * Add an image
             * @param options The image attributes
             * @example
             * editor
             *   .commands
             *   .setImage({ src: 'https://tiptap.dev/logo.png', alt: 'tiptap', title: 'tiptap logo' })
             */
            setImage: (options: ImageOptions) => ReturnType
        };
    }
}

function isAbsolutePath(path: string): boolean {
    return path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//');
}

function withUnit(size?: string | null): string {
    if (!size) return '';
    return size.endsWith('px') || size.endsWith('em') || size.endsWith('rem') || size.endsWith('%') ? size : size + 'px';
}

interface Image2Storage {
    blob?: { blob?: Blob, id: number, url: string };
    dom?: { container: HTMLElement, img: HTMLImageElement };
}

export const Image = Node.create<ImageOptions, Image2Storage>({
    name: 'image',

    addOptions() {
        return {
            inline: false,
            allowBase64: false,
            HTMLAttributes: {},
        };
    },

    inline() {
        return this.options.inline;
    },

    group() {
        return this.options.inline ? 'inline' : 'block';
    },

    draggable: true,

    addAttributes() {
        return {
            path: {
                default: '',
            },
            alt: {
                default: '',
            },
            width: {
                default: null,
            },
            valign: {
                default: null,
            },
            textAlign: {
                default: null,
            },
        };
    },

    renderHTML(props) {
        //required for drag and drop
        return '';
    },

    addNodeView() {
        const textEditor = this.options.textEditor;
        let cache: { container: HTMLElement, img: HTMLImageElement, blob?: { blob?: Blob, path: string, url: string }, abort?: AbortController };

        // console.log('new addNodeView');

        return ((props: NodeViewRendererProps) => {
            cache = cache || { container: document.createElement('div'), img: document.createElement('img') };
            if (!cache.img.parentElement) {
                cache.container.classList.add('image');
                cache.container.appendChild(cache.img);
            }

            function destroy(): void {
                console.log('destroy image', props.node.attrs.path);
                if (cache.blob) {
                    URL.revokeObjectURL(cache.blob.url);
                }
                cache.img.remove();
                cache.container.remove();
            }

            function update(node: ProseNode, decorations: readonly Decoration[], innerDecorations: DecorationSource): boolean {
                const path = node.attrs.path;
                console.log('update image', path, node.attrs);

                if (isAbsolutePath(path)) {
                    cache.img.setAttribute('src', path);
                } else {
                    if (!cache.blob || cache.blob.path !== path) {
                        cache.abort?.abort();
                        const abort = cache.abort = new AbortController();
                        textEditor!.filesystemApi().getData(path).then((content) => {
                            if (abort.signal.aborted) return;
                            if (cache.blob) {
                                URL.revokeObjectURL(cache.blob.url);
                            }
                            if (!content) return;
                            const blob = new Blob([content.data as BlobPart], { type: content.mimeType });
                            cache.blob = {
                                blob,
                                path: path,
                                url: URL.createObjectURL(blob),
                            };
                            cache.img.setAttribute('src', cache.blob.url);
                        }).catch((error) => {
                            console.log('Error loading image', path, error);
                        });
                    } else {
                        cache.img.setAttribute('src', cache.blob.url);
                    }
                }

                cache.img.style.width = withUnit(node.attrs.width);
                cache.img.setAttribute('alt', node.attrs.alt || '');
                cache.container.classList.remove('align-left', 'align-center', 'align-right');
                if (node.attrs.textAlign && node.attrs.textAlign !== 'left') {
                    cache.container.classList.add('align-' + node.attrs.textAlign);
                }

                return true;
            }

            update(props.node, props.decorations, props.innerDecorations);

            return {
                dom: cache.container, update, destroy,
            } as NodeView;
        }) as NodeViewRenderer;
    },

    addCommands() {
        return {
            setImage:
                options =>
                    ({ commands }) => {
                        return commands.insertContent({
                            type: this.name,
                            attrs: options,
                        });
                    },
        };
    },
});
