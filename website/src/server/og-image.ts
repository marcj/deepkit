// Social preview images (og:image) for all pages, rendered from the content of the page: section, title and
// description on the dark Deepkit background, like the previews GitHub generates for repositories.
import { readFileSync } from 'fs';
import { join } from 'path';

import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';

import { findParentPath } from '@deepkit/app';
import { getCurrentDirName } from '@deepkit/core';

export const ogImageWidth = 1200;
export const ogImageHeight = 630;

export interface OgImageContent {
    /** e.g. "Documentation · Deepkit ORM" */
    section: string;
    title: string;
    description: string;
    /** shown at the bottom, e.g. deepkit.io/en/documentation/orm */
    url: string;
    /** language of the page, decides the font of Chinese characters that are also Japanese */
    lang?: string;
}

const assetsDir = findParentPath('src/assets', getCurrentDirName()) || '';

let assets: { fonts: { name: string; data: Buffer; weight: 300 | 400 | 600 | 700; style: 'normal' }[]; logo: string; banner: string } | undefined;

function loadAssets() {
    if (assets) return assets;
    const font = (file: string) => readFileSync(join(assetsDir, 'muli', file));
    assets = {
        fonts: [
            { name: 'Muli', data: font('Muli-Light.woff'), weight: 300, style: 'normal' },
            { name: 'Muli', data: font('Muli.woff'), weight: 400, style: 'normal' },
            { name: 'Muli', data: font('Muli-SemiBold.woff'), weight: 600, style: 'normal' },
            { name: 'Muli', data: font('Muli-Bold.woff'), weight: 700, style: 'normal' },
        ],
        logo: 'data:image/svg+xml;base64,' + readFileSync(join(assetsDir, 'images/deepkit_white.svg')).toString('base64'),
        banner: 'data:image/jpeg;base64,' + readFileSync(join(assetsDir, 'images/startpage-banner-small.jpg')).toString('base64'),
    };
    return assets;
}

const cjkFonts: Record<string, string> = {
    'zh-CN': 'Noto Sans SC',
    'zh-TW': 'Noto Sans TC',
    'zh-HK': 'Noto Sans TC',
    'ja-JP': 'Noto Sans JP',
    'ko-KR': 'Noto Sans KR',
};

/**
 * Muli has no Chinese, Japanese or Korean glyphs. Satori asks for a font for such text, which we load from
 * Google Fonts, reduced to the glyphs of the text (a few KB). Without network the text is rendered as boxes.
 */
let fallbackFontId = 0;

async function loadFallbackFont(lang: string, languageCode: string, text: string): Promise<any> {
    // Chinese characters come as "ja-JP|zh-CN|zh-TW|zh-HK", the language of the page decides
    const codes = languageCode.split('|');
    const code = codes.find(v => v.startsWith(lang + '-')) || codes.find(v => cjkFonts[v]);
    const family = code && cjkFonts[code];
    if (!family) return [];
    try {
        const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@300;400;600&text=${encodeURIComponent(text)}`)).text();
        const fonts: { name: string; data: ArrayBuffer; weight: number; style: 'normal' }[] = [];
        for (const face of css.split('@font-face').slice(1)) {
            const url = face.match(/src: url\((.+?)\)/)?.[1];
            const weight = Number(face.match(/font-weight: (\d+)/)?.[1] || 400);
            // each subset under its own name, otherwise the subset of the next text segment replaces it
            if (url) fonts.push({ name: `${family} ${++fallbackFontId}`, data: await (await fetch(url)).arrayBuffer(), weight, style: 'normal' });
        }
        return fonts;
    } catch {
        return [];
    }
}

/** satori takes React elements, these are plain objects of the same shape */
function h(type: string, style: Record<string, any>, ...children: any[]): any {
    const props: Record<string, any> = { style };
    if (type === 'img') {
        props.src = children[0];
        props.width = style.width;
        props.height = style.height;
    } else {
        props.children = children.length === 1 ? children[0] : children;
    }
    return { type, props };
}

/** Chinese, Japanese and Korean characters are about twice as wide as latin ones */
function visualLength(text: string): number {
    let length = 0;
    for (const char of text) length += /[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/.test(char) ? 2 : 1;
    return length;
}

/** Shortens text to the given visual length, at the end of a sentence if possible, otherwise at a word. */
function truncate(text: string, length: number): string {
    text = text.replace(/\s+/g, ' ').trim();
    if (visualLength(text) <= length) return text;
    let cut = 0;
    for (let i = 0, width = 0; i < text.length && width < length; i++) {
        width += visualLength(text[i]);
        cut = i;
    }
    const head = text.substring(0, cut);
    const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('。'), head.lastIndexOf('! '), head.lastIndexOf('? '));
    if (sentence > head.length * 0.5) return text.substring(0, sentence + 1);
    const word = head.lastIndexOf(' ');
    return (word > head.length * 0.6 ? head.substring(0, word) : head).replace(/[\s,.;:，、]+$/, '') + '…';
}

export async function renderOgImage(content: OgImageContent): Promise<Buffer> {
    const { fonts, logo, banner } = loadAssets();
    const title = truncate(content.title, 90);
    const titleSize = visualLength(title) > 60 ? 54 : visualLength(title) > 32 ? 62 : 72;

    const element = h(
        'div',
        { width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#0b0d10', fontFamily: 'Muli' },
        // the banner of the start page on the right, fading into the background
        h('img', { position: 'absolute', right: -120, top: 0, width: 760, height: ogImageHeight, objectFit: 'cover', opacity: 0.55 }, banner),
        h('div', {
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            backgroundImage: 'linear-gradient(90deg, #0b0d10 0%, #0b0d10 45%, rgba(11, 13, 16, 0.55) 75%, rgba(11, 13, 16, 0.3) 100%)',
        }),
        h(
            'div',
            { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', padding: '64px 72px 52px' },
            h(
                'div',
                { display: 'flex', alignItems: 'center' },
                h('img', { width: 38, height: 48 }, logo),
                h('div', { marginLeft: 22, fontSize: 26, fontWeight: 700, letterSpacing: 12, color: 'white' }, 'DEEPKIT'),
            ),
            h(
                'div',
                { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', maxWidth: 860 },
                content.section
                    ? h('div', { fontSize: 22, fontWeight: 600, letterSpacing: 3, color: '#f35828', textTransform: 'uppercase', marginBottom: 22 }, truncate(content.section, 60))
                    : h('div', { display: 'none' }, ''),
                h('div', { fontSize: titleSize, fontWeight: 300, lineHeight: 1.15, color: '#f9eddf' }, title),
                content.description
                    ? h('div', { fontSize: 27, fontWeight: 400, lineHeight: 1.5, color: '#a9adb3', marginTop: 26 }, truncate(content.description, 160))
                    : h('div', { display: 'none' }, ''),
            ),
            h('div', { fontSize: 22, color: '#7d838b', letterSpacing: 0.5 }, truncate(content.url, 80)),
        ),
        h('div', { position: 'absolute', left: 0, bottom: 0, width: '100%', height: 8, backgroundImage: 'linear-gradient(90deg, #f35828, #b54116)' }),
    );

    const svg = await satori(element, { width: ogImageWidth, height: ogImageHeight, fonts, loadAdditionalAsset: (code, text) => loadFallbackFont(content.lang || 'en', code, text) });
    return new Resvg(svg, { fitTo: { mode: 'width', value: ogImageWidth } }).render().asPng();
}
