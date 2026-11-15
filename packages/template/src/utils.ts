// Characters that must be escaped in text content.
const htmlTestRegex = /[&<>]/;
const htmlReplaceRegex = /[&<>]/g;
// Characters that must be escaped in (double or single) quoted attribute values.
const attributeTestRegex = /[&"'<>]/;
const attributeReplaceRegex = /[&"'<>]/g;

const escapeMap: { [char: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

function replaceChar(char: string): string {
    return escapeMap[char];
}

/**
 * Escapes the given value and marks it as already escaped HTML.
 *
 * Uses attribute escaping (`&`, `"`, `'`, `<`, `>`) so the result is safe both
 * as text content and as attribute value.
 */
export function escape(html: string | any): { htmlString: string } {
    return { htmlString: escapeAttribute(html) };
}

/**
 * Escapes `&`, `<` and `>` so the value can be used as HTML text content.
 * Strings that need no escaping are returned as-is (no allocation).
 */
export function escapeHtml(html: string | any): string {
    if ('string' !== typeof html) html = String(html);
    return htmlTestRegex.test(html) ? html.replace(htmlReplaceRegex, replaceChar) : html;
}

/**
 * Escapes `&`, `"`, `'`, `<` and `>` so the value can be used inside a quoted attribute value.
 * Strings that need no escaping are returned as-is (no allocation).
 */
export function escapeAttribute(attribute: string | any): string {
    if ('string' !== typeof attribute) attribute = String(attribute);
    return attributeTestRegex.test(attribute) ? attribute.replace(attributeReplaceRegex, replaceChar) : attribute;
}

/**
 * Marks a value as safe. You know it does not contain html.
 */
export function safe(html: string) {
    return { htmlString: html };
}

export const safeString = Symbol('safe');
