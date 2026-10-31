// Unions checked with rotating values, so V8 has to evaluate the members (an unchanged value can be moved out of the loop).
import { BenchSuite } from '@deepkit/bench';
import { deserialize, guard, MaxLength, MinLength, Positive } from '@deepkit/type';

interface TextMessage { type: 'text'; content: string & MinLength<1> & MaxLength<1000>; sender: string & MinLength<1>; }
interface ImageMessage { type: 'image'; url: string & MinLength<10>; width: number & Positive; height: number & Positive; sender: string & MinLength<1>; }
interface VideoMessage { type: 'video'; url: string & MinLength<10>; duration: number & Positive; sender: string & MinLength<1>; }
interface FileMessage { type: 'file'; filename: string & MinLength<1>; size: number & Positive; mimeType: string & MinLength<3>; sender: string & MinLength<1>; }
type Message = TextMessage | ImageMessage | VideoMessage | FileMessage;

export default function () {
    const suite = new BenchSuite('type/union');
    const g = guard<Message>();
    const make = (i: number): any => [
        { type: 'text', content: 'Hello ' + i, sender: 'u' + i },
        { type: 'image', url: 'https://example.com/' + i, width: 800 + i, height: 600, sender: 'u' + i },
        { type: 'video', url: 'https://example.com/' + i, duration: 10 + i, sender: 'u' + i },
        { type: 'file', filename: 'f' + i, size: 10 + i, mimeType: 'text/plain', sender: 'u' + i },
    ][i & 3];
    const items = Array.from({ length: 16 }, (_, i) => make(i));
    let i = 0;
    suite.add('guard union (rotating members)', () => g(items[i++ & 15]));
    const texts = Array.from({ length: 16 }, (_, k) => make(k * 4));
    suite.add('guard union text only', () => g(texts[i++ & 15]));
    suite.add('deserialize union', () => deserialize<Message>(items[i++ & 15]));
    return suite;
}
