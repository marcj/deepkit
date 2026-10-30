export function imageSize(data: Uint8Array): Promise<{ width: number, height: number } | undefined> {
    const blob = new Blob([data as BlobPart]);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = URL.createObjectURL(blob);
        img.onload = function() {
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = function() {
            resolve(undefined);
        };
    });
}

export function mimeTypeToLabel(mimeType?: string) {
    if (!mimeType) return 'Unknown';

    const map: { [name: string]: string } = {
        'application/octet-stream': 'Binary',
        'application/json': 'JSON',
        'application/xml': 'XML',
        'application/xhtml+xml': 'XHTML',
        'application/javascript': 'JavaScript',
        'application/typescript': 'TypeScript',

        'application/pdf': 'PDF',
        'application/zip': 'ZIP',
        'application/x-rar-compressed': 'RAR',
        'application/x-7z-compressed': '7Z',
        'application/x-tar': 'TAR',
        'application/x-gzip': 'GZIP',
        'application/x-bzip2': 'BZIP2',
        'application/x-bzip': 'BZIP',
        'application/x-lzma': 'LZMA',
        'application/x-xz': 'XZ',
        'application/x-compress': 'COMPRESS',
        'application/x-apple-diskimage': 'DMG',
        'application/x-msdownload': 'EXE',
        'application/x-ms-dos-executable': 'EXE',
        'application/x-msi': 'MSI',
        'application/x-ms-shortcut': 'LNK',
        'application/x-shockwave-flash': 'SWF',
        'application/x-sqlite3': 'SQLITE',
        'application/x-iso9660-image': 'ISO',
        'application/x-ms-wim': 'WIM',
        'application/x-ms-xbap': 'XAP',

        'video/x-msvideo': 'AVI',
        'video/x-ms-wmv': 'WMV',
        'video/x-ms-asf': 'ASF',

        'video/mp4': 'MP4',
        'video/mpeg': 'MPEG',
        'video/quicktime': 'MOV',
        'audio/x-wav': 'WAV',
        'audio/x-aiff': 'AIFF',
        'audio/x-m4a': 'M4A',
        'audio/x-ms-wma': 'WMA',
        'audio/x-ms-wax': 'WAX',
        'audio/x-ms-wpl': 'WPL',
        'audio/x-mpegurl': 'M3U',
        'audio/x-scpls': 'PLS',
        'audio/x-flac': 'FLAC',
        'audio/x-ogg': 'OGG',
        'audio/x-matroska': 'MKV',

        'image/jpeg': 'JPEG',
        'image/png': 'PNG',
        'image/gif': 'GIF',
        'image/bmp': 'BMP',
        'image/tiff': 'TIFF',

        'text/plain': 'TXT',
        'text/html': 'HTML',
        'text/javascript': 'JS',
        'text/json': 'JSON',

        'text/css': 'CSS',
        'text/csv': 'CSV',
        'text/calendar': 'ICS',
        'text/xml': 'XML',
    };
    return map[mimeType] || (mimeType.split('/')[1] || 'Unknown').toUpperCase();
}
