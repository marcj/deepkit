const {
    utils: { getPackages },
} = require('@commitlint/config-lerna-scopes');

const customScopes = ['deps'];

// GitHub turns @name into a link to (and a notification for) the user or org with that name,
// e.g. "@deepkit packages". Refer to packages with their full name like @deepkit/type.
// Code spans are fine, GitHub does not link inside them.
const githubMention = /(^|[^\w.`/])@([a-z\d](?:[a-z\d-]*[a-z\d])?)(?![\w/-])/i;

module.exports = {
    extends: ['@commitlint/config-conventional', '@commitlint/config-lerna-scopes'],
    ignores: [
        message =>
            message.startsWith('Merge') ||
            message.startsWith('Revert'),
    ],
    plugins: [
        {
            rules: {
                'no-github-mention': ({ raw }) => {
                    const match = (raw || '').replace(/`[^`\n]*`/g, '').match(githubMention);
                    return [!match, match ? `"@${match[2]}" mentions a GitHub user or org, use the full package name like @deepkit/type` : ''];
                },
            },
        },
    ],
    rules: {
        'header-max-length': [0, 'always', 125],
        'footer-max-line-length': [0, 'always', Infinity],
        'body-max-line-length': [0, 'always', Infinity],
        'no-github-mention': [2, 'always'],
        'scope-enum': async ctx => [
            2,
            'always',
            [...customScopes, ...(await getPackages(ctx))],
        ],
    },
};
