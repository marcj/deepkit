export const siteUrl = 'https://deepkit.io';

/** the URL of the social preview image of a page, e.g. /og/en/documentation/orm.png */
export function ogImagePath(path: string): string {
    return '/og' + (path === '/' ? '/index' : path.replace(/\/$/, '')) + '.png';
}
