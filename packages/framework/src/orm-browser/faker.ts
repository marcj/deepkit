/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { randomUUID } from 'crypto';

/**
 * Small fake data generator for the ORM browser's seed feature.
 * Function names follow faker.js 5 (e.g. 'name.firstName'), so seed settings stored by the GUI keep working.
 */

const int = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const times = (count: number, fn: () => string) => Array.from({ length: count }, fn);
const digits = (count: number) => times(count, () => String(int(0, 9))).join('');
const chars = (count: number, alphabet: string) =>
    times(count, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
const capitalize = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
const hex = '0123456789abcdef';
const alpha = 'abcdefghijklmnopqrstuvwxyz';
const day = 24 * 60 * 60 * 1000;
const year = 365 * day;

const firstNames = [
    'James',
    'Mary',
    'John',
    'Patricia',
    'Robert',
    'Jennifer',
    'Michael',
    'Linda',
    'David',
    'Elizabeth',
    'William',
    'Barbara',
    'Richard',
    'Susan',
    'Joseph',
    'Jessica',
    'Thomas',
    'Sarah',
    'Charles',
    'Karen',
    'Lukas',
    'Emma',
    'Noah',
    'Mia',
    'Liam',
    'Sofia',
    'Mateo',
    'Hannah',
    'Yuki',
    'Amara',
];
const lastNames = [
    'Smith',
    'Johnson',
    'Williams',
    'Brown',
    'Jones',
    'Garcia',
    'Miller',
    'Davis',
    'Rodriguez',
    'Martinez',
    'Wilson',
    'Anderson',
    'Taylor',
    'Thomas',
    'Moore',
    'Jackson',
    'Martin',
    'Lee',
    'Thompson',
    'White',
    'Müller',
    'Schmidt',
    'Schneider',
    'Fischer',
    'Weber',
    'Rossi',
    'Dubois',
    'Nowak',
    'Tanaka',
    'Okafor',
];
const words = [
    'lorem',
    'ipsum',
    'dolor',
    'sit',
    'amet',
    'consectetur',
    'adipiscing',
    'elit',
    'sed',
    'do',
    'eiusmod',
    'tempor',
    'incididunt',
    'ut',
    'labore',
    'et',
    'dolore',
    'magna',
    'aliqua',
    'enim',
    'ad',
    'minim',
    'veniam',
    'quis',
    'nostrud',
    'exercitation',
    'ullamco',
    'laboris',
    'nisi',
    'aliquip',
    'ex',
    'ea',
    'commodo',
    'consequat',
    'duis',
    'aute',
    'irure',
    'in',
    'reprehenderit',
    'voluptate',
    'velit',
    'esse',
    'cillum',
    'fugiat',
    'nulla',
    'pariatur',
];
const cities = [
    'Berlin',
    'Hamburg',
    'Munich',
    'London',
    'Paris',
    'Madrid',
    'Rome',
    'Vienna',
    'Amsterdam',
    'Prague',
    'New York',
    'Chicago',
    'Toronto',
    'Sydney',
    'Tokyo',
    'Seoul',
    'Lagos',
    'Nairobi',
    'São Paulo',
    'Lima',
];
const countries: [string, string][] = [
    ['Germany', 'DE'],
    ['France', 'FR'],
    ['Spain', 'ES'],
    ['Italy', 'IT'],
    ['Austria', 'AT'],
    ['Netherlands', 'NL'],
    ['United Kingdom', 'GB'],
    ['United States', 'US'],
    ['Canada', 'CA'],
    ['Australia', 'AU'],
    ['Japan', 'JP'],
    ['Brazil', 'BR'],
    ['Nigeria', 'NG'],
    ['Kenya', 'KE'],
    ['Peru', 'PE'],
];
const streetSuffixes = ['Street', 'Avenue', 'Road', 'Lane', 'Way', 'Drive', 'Court', 'Place'];
const timeZones = [
    'Europe/Berlin',
    'Europe/London',
    'Europe/Paris',
    'America/New_York',
    'America/Chicago',
    'America/Los_Angeles',
    'Asia/Tokyo',
    'Australia/Sydney',
    'Africa/Lagos',
    'UTC',
];
const colors = [
    'red',
    'green',
    'blue',
    'yellow',
    'orange',
    'purple',
    'black',
    'white',
    'gray',
    'pink',
    'cyan',
    'magenta',
    'teal',
    'olive',
    'navy',
];
const departments = [
    'Books',
    'Electronics',
    'Computers',
    'Garden',
    'Toys',
    'Clothing',
    'Sports',
    'Health',
    'Grocery',
    'Music',
];
const adjectives = [
    'Small',
    'Ergonomic',
    'Rustic',
    'Intelligent',
    'Gorgeous',
    'Practical',
    'Sleek',
    'Handmade',
    'Generic',
    'Fantastic',
];
const materials = ['Steel', 'Wooden', 'Concrete', 'Plastic', 'Cotton', 'Granite', 'Rubber', 'Metal', 'Soft', 'Fresh'];
const products = [
    'Chair',
    'Car',
    'Computer',
    'Keyboard',
    'Mouse',
    'Bike',
    'Ball',
    'Gloves',
    'Pants',
    'Shirt',
    'Table',
    'Shoes',
    'Hat',
    'Lamp',
];
const companySuffixes = ['Inc', 'LLC', 'Group', 'GmbH', 'Ltd', 'and Sons'];
const jobDescriptors = ['Lead', 'Senior', 'Junior', 'Principal', 'Chief', 'Associate'];
const jobAreas = ['Software', 'Marketing', 'Data', 'Security', 'Product', 'Infrastructure', 'Finance', 'Research'];
const jobTypes = ['Engineer', 'Manager', 'Designer', 'Analyst', 'Consultant', 'Architect', 'Developer'];
const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];
const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const currencies = ['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'SEK', 'BRL', 'NGN'];
const domainSuffixes = ['com', 'net', 'org', 'io', 'dev', 'info', 'de'];
const freeEmails = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
const fileTypes: [string, string][] = [
    ['txt', 'text/plain'],
    ['html', 'text/html'],
    ['json', 'application/json'],
    ['pdf', 'application/pdf'],
    ['png', 'image/png'],
    ['jpg', 'image/jpeg'],
    ['gif', 'image/gif'],
    ['mp3', 'audio/mpeg'],
    ['mp4', 'video/mp4'],
    ['zip', 'application/zip'],
    ['csv', 'text/csv'],
];
const directories = ['/home', '/usr/bin', '/var/log', '/etc', '/opt', '/tmp', '/srv/data'];

const firstName = () => pick(firstNames);
const lastName = () => pick(lastNames);
const word = () => pick(words);
const wordList = (count: number) => times(count, word).join(' ');
const sentence = () => capitalize(wordList(int(3, 10))) + '.';
const sentences = (count: number = int(2, 6)) => times(count, sentence).join(' ');
const paragraph = () => sentences(3);
const userName = () => firstName() + pick(['', '.', '_']) + (Math.random() > 0.5 ? lastName() : String(int(1, 99)));
const domainWord = () =>
    pick(lastNames)
        .toLowerCase()
        .replace(/[^a-z]/g, '') || 'example';
const domainName = () => domainWord() + '.' + pick(domainSuffixes);
const email = (domain: string) => (userName() + '@' + domain).replace(/[^\w.@+-]/g, '');
const fileType = () => pick(fileTypes);
const fileName = () => word() + '_' + word() + '.' + fileType()[0];

/**
 * IBAN with a valid check sum (ISO 13616, mod 97).
 */
function iban(): string {
    const bban = digits(18);
    const numeric = bban + '1314' + '00'; //DE = 13 14
    let remainder = 0;
    for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
    return 'DE' + String(98 - remainder).padStart(2, '0') + bban;
}

export const fakers: { [name: string]: () => any } = {
    'address.zipCode': () => digits(5),
    'address.city': () => pick(cities),
    'address.streetName': () => lastName() + ' ' + pick(streetSuffixes),
    'address.streetAddress': () => int(1, 9999) + ' ' + lastName() + ' ' + pick(streetSuffixes),
    'address.secondaryAddress': () => pick(['Apt.', 'Suite']) + ' ' + int(1, 999),
    'address.country': () => pick(countries)[0],
    'address.countryCode': () => pick(countries)[1],
    'address.latitude': () => (Math.random() * 180 - 90).toFixed(4),
    'address.longitude': () => (Math.random() * 360 - 180).toFixed(4),
    'address.timeZone': () => pick(timeZones),
    'commerce.color': () => pick(colors),
    'commerce.department': () => pick(departments),
    'commerce.productName': () => pick(adjectives) + ' ' + pick(materials) + ' ' + pick(products),
    'commerce.product': () => pick(products),
    'commerce.price': () => int(1, 1000) + '.00',
    'company.companyName': () => lastName() + ' ' + pick(companySuffixes),
    'date.past': () => new Date(Date.now() - Math.random() * year),
    'date.future': () => new Date(Date.now() + Math.random() * year),
    'date.recent': () => new Date(Date.now() - Math.random() * day),
    'date.soon': () => new Date(Date.now() + Math.random() * day),
    'date.month': () => pick(months),
    'date.weekday': () => pick(weekdays),
    'finance.account': () => digits(8),
    'finance.amount': () => (Math.random() * 1000).toFixed(2),
    'finance.currencyCode': () => pick(currencies),
    'finance.iban': iban,
    'finance.bic': () => chars(4, alpha.toUpperCase()) + 'DE' + chars(2, alpha.toUpperCase() + '0123456789'),
    'git.branch': () => word() + '-' + word(),
    'git.commitSha': () => chars(40, hex),
    'git.shortSha': () => chars(7, hex),
    'image.imageUrl': () => `https://picsum.photos/seed/${chars(8, alpha)}/640/480`,
    'internet.email': () => email(pick(freeEmails)),
    'internet.exampleEmail': () => email(pick(['example.com', 'example.org', 'example.net'])),
    'internet.userName': userName,
    'internet.url': () => 'https://' + domainName(),
    'internet.domainName': domainName,
    'internet.domainSuffix': () => pick(domainSuffixes),
    'internet.domainWord': domainWord,
    'internet.ip': () => times(4, () => String(int(0, 255))).join('.'),
    'internet.ipv6': () => times(8, () => chars(4, hex)).join(':'),
    'internet.port': () => int(0, 65535),
    'internet.color': () => '#' + chars(6, hex),
    'internet.mac': () => times(6, () => chars(2, hex)).join(':'),
    'internet.password': () => chars(15, alpha + alpha.toUpperCase() + '0123456789'),
    'internet.protocol': () => pick(['http', 'https']),
    'internet.httpMethod': () => pick(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    'lorem.word': word,
    'lorem.words': () => wordList(3),
    'lorem.sentence': sentence,
    'lorem.slug': () => times(3, word).join('-'),
    'lorem.sentences': () => sentences(),
    'lorem.paragraph': paragraph,
    'lorem.paragraphs': () => times(3, paragraph).join('\n'),
    'lorem.text': () => sentences(),
    'lorem.lines': () => times(int(1, 5), sentence).join('\n'),
    'name.firstName': firstName,
    'name.lastName': lastName,
    'name.findName': () => firstName() + ' ' + lastName(),
    'name.jobTitle': () => pick(jobDescriptors) + ' ' + pick(jobAreas) + ' ' + pick(jobTypes),
    'name.jobArea': () => pick(jobAreas),
    'name.jobType': () => pick(jobTypes),
    'name.prefix': () => pick(['Mr.', 'Mrs.', 'Ms.', 'Dr.']),
    'phone.phoneNumber': () => digits(3) + '-' + digits(3) + '-' + digits(4),
    'random.number': () => int(0, 99999),
    'random.float': () => Math.round(Math.random() * 9999999) / 100,
    'random.uuid': () => randomUUID(),
    'random.boolean': () => Math.random() > 0.5,
    'random.word': word,
    'random.words': () => wordList(int(1, 3)),
    'random.alpha': () => chars(1, alpha),
    'random.alphaNumeric': () => chars(1, alpha + '0123456789'),
    'random.hexaDecimal': () => '0x' + chars(1, hex),
    'system.fileName': fileName,
    'system.mimeType': () => fileType()[1],
    'system.fileExt': () => fileType()[0],
    'system.directoryPath': () => pick(directories),
    'system.filePath': () => pick(directories) + '/' + fileName(),
    'system.semver': () => int(0, 9) + '.' + int(0, 9) + '.' + int(0, 9),
    'time.recent': () => Date.now() - Math.floor(Math.random() * day),
};
