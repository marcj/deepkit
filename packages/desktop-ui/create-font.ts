import {createReadStream, createWriteStream, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'fs';
import {join} from 'path';

const svg2ttf = require('svg2ttf');
const ttf2woff = require('ttf2woff');
const SVGIcons2SVGFontStream = require('svgicons2svgfont');


function readFolder(dir: string, files: { [path: string]: string }) {
    const read = readdirSync(dir);
    for (const file of read) {
        const stat = lstatSync(join(dir, file));
        if (stat.isDirectory()) {
            readFolder(join(dir, file), files);
        } else {
            if (file.endsWith('.svg')) {
                files[join(dir, file)] = file.replace('.svg', '');
            }
        }
    }
}

const projectOutput = process.argv[2] ? process.argv[2] : undefined;

const out = './src/assets/fonts';
const fontFileName = 'ui-icons';

mkdirSync(out, { recursive: true });

(async () => {
    const files: { [path: string]: string } = {};

    readFolder(__dirname + '/../src/assets/icons', files);
    if (projectOutput) {
        readFolder(projectOutput, files);
    }

    const fontStream = new SVGIcons2SVGFontStream({
        fontName: 'Desktop UI icon Mono',
        fontHeight: 1700,
        normalize: true,
        fixedWidth: true,
    });

    fontStream.pipe(createWriteStream(`${out}/${fontFileName}.svg`))
        .on('finish', function () {
            console.log('SVG successfully created!');

            const ttfConverted = svg2ttf(readFileSync(`${out}/${fontFileName}.svg`, 'utf8'), {
                description: 'Desktop UI Icons'
            });
            writeFileSync(`${out}/${fontFileName}.ttf`, new Buffer(ttfConverted.buffer));
            console.log('TTF successfully created!');

            {
                const ttfInput = readFileSync(`${out}/${fontFileName}.ttf`);
                const ttf = new Uint8Array(ttfInput);
                const woff = new Buffer(ttf2woff(ttf, {}).buffer);
                writeFileSync(`${out}/${fontFileName}.woff`, woff);
                console.log('WOFF successfully created!')
            }

            if (projectOutput) {
                console.log(`Done. Dont forget to add following code in your styles.scss.`);
                console.log(
                    readFileSync(__dirname + '/../src/scss/icon.scss', 'utf8').replace(/\.\.\/assets\/fonts/, out)
                )
            }
        })
        .on('error', function (err: any) {
            console.log(err);
            process.exit(1);
        });

    let unicode = 57345; //\uE001
    const icons: string[] = [];
    for (const file in files) {
        const glyph = createReadStream(file);
        const name = files[file];
        icons.push(name);

        (glyph as any)['metadata'] = {
            unicode: [String.fromCharCode(unicode++), name],
            name: name
        };

        console.log('Glyph', name);
        fontStream.write(glyph);
    }

    // Do not forget to end the stream
    fontStream.end();
    writeFileSync(`${out}/icon-names.json`, JSON.stringify(icons));
})();
