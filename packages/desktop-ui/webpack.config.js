const path = require('path');
const { BannerPlugin } = require('webpack');

module.exports = {
    entry: {
        'create-font': path.resolve(__dirname, 'create-font.ts'),
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'bin/')
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
        symlinks: false,
    },
    target: 'node',
    // bin scripts need a shebang to be executable via npx / package.json bin
    plugins: [new BannerPlugin({ banner: '#!/usr/bin/env node', raw: true, entryOnly: true })],
    // mode: 'production',
    devtool: 'cheap-module-source-map',
    node: {
        __dirname: false,
        __filename: false,
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                loader: 'ts-loader',
                options: {
                    allowTsInNodeModules: true,
                },
            },
        ]
    }
}
;
