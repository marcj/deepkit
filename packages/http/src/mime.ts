/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { extname } from 'path';

/**
 * File extension to MIME type map of common web types.
 * Add more types at runtime by setting `mimeTypes[extension] = type`.
 */
export const mimeTypes: { [extension: string]: string } = {
    // text
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    mjs: 'text/javascript',
    cjs: 'application/node',
    txt: 'text/plain',
    text: 'text/plain',
    csv: 'text/csv',
    tsv: 'text/tab-separated-values',
    md: 'text/markdown',
    markdown: 'text/markdown',
    yaml: 'text/yaml',
    yml: 'text/yaml',
    ics: 'text/calendar',
    vtt: 'text/vtt',
    appcache: 'text/cache-manifest',
    // application
    json: 'application/json',
    map: 'application/json',
    jsonld: 'application/ld+json',
    webmanifest: 'application/manifest+json',
    xml: 'application/xml',
    xsl: 'application/xml',
    rtf: 'application/rtf',
    wasm: 'application/wasm',
    pdf: 'application/pdf',
    zip: 'application/zip',
    gz: 'application/gzip',
    tar: 'application/x-tar',
    bz2: 'application/x-bzip2',
    '7z': 'application/x-7z-compressed',
    rar: 'application/vnd.rar',
    xz: 'application/x-xz',
    bin: 'application/octet-stream',
    epub: 'application/epub+zip',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    odt: 'application/vnd.oasis.opendocument.text',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    odp: 'application/vnd.oasis.opendocument.presentation',
    m3u8: 'application/vnd.apple.mpegurl',
    mpd: 'application/dash+xml',
    // images
    png: 'image/png',
    apng: 'image/apng',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    jpe: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    svg: 'image/svg+xml',
    svgz: 'image/svg+xml',
    ico: 'image/vnd.microsoft.icon',
    bmp: 'image/bmp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    heic: 'image/heic',
    heif: 'image/heif',
    jxl: 'image/jxl',
    psd: 'image/vnd.adobe.photoshop',
    // fonts
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
    eot: 'application/vnd.ms-fontobject',
    // audio
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    oga: 'audio/ogg',
    ogg: 'audio/ogg',
    opus: 'audio/ogg',
    wav: 'audio/wav',
    flac: 'audio/x-flac',
    // video
    mp4: 'video/mp4',
    m4v: 'video/x-m4v',
    webm: 'video/webm',
    ogv: 'video/ogg',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
    mpeg: 'video/mpeg',
    mpg: 'video/mpeg',
    '3gp': 'video/3gpp',
    ts: 'video/mp2t',
    // 3d models
    glb: 'model/gltf-binary',
    gltf: 'model/gltf+json',
    obj: 'model/obj',
    stl: 'model/stl',
    usdz: 'model/vnd.usdz+zip',
};

/**
 * Returns the MIME type for a file path, file name, or extension (with or without leading dot).
 * Returns undefined for unknown extensions.
 *
 * `getMimeType('/assets/logo.svg')` → `image/svg+xml`
 */
export function getMimeType(path: string): string | undefined {
    const extension = extname('x.' + path)
        .slice(1)
        .toLowerCase();
    return Object.prototype.hasOwnProperty.call(mimeTypes, extension) ? mimeTypes[extension] : undefined;
}

/**
 * Returns the value for a Content-Type header, including `charset=utf-8` for text types.
 * Returns undefined for unknown extensions.
 */
export function getContentType(path: string): string | undefined {
    const type = getMimeType(path);
    if (!type) return;
    const isText = type.startsWith('text/') || type === 'application/json' || type === 'application/manifest+json';
    return isText ? type + '; charset=utf-8' : type;
}
