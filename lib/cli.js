import { fileURLToPath } from 'url';
import * as path from 'path';
import { readJSONFileSync } from './fs.js';

const pckg = readJSONFileSync(path.resolve(path.parse(fileURLToPath(import.meta.url)).dir, '../package.json'));

export const programInfo = {
    name: pckg.name,
    version: pckg.version
};

export function showHelp(exitCode) {
    const leftColumn = [];
    const rightColumn = [];

    for (const [name, alias, description, placeholder, _default] of programOptionsInfo) {
        leftColumn.push(
            (alias ? `-${alias}, ` : '') +
            `--${name}` +
            (placeholder ? `=<${placeholder}>` : '')
        );
        rightColumn.push(
            (description ?? '') +
            (_default ? ` (default: '${_default}')` : '') +
            '.'
        );
    }

    const maxLength = Math.max(...leftColumn.map(s => s.length)) + 2;

    console.log(
        `Usage: ${programInfo.name} [options]

Options:
${leftColumn.map((left, i) => '  ' + left.padEnd(maxLength) + rightColumn[i]).join('\n')}
`);

    if (exitCode !== undefined)
        process.exit(exitCode);
}

export function showVersion(exitCode) {
    console.log(`${programInfo.version}`);
    if (exitCode !== undefined)
        process.exit(exitCode);
}

export const programOptionsInfo = [
    ['config', 'c', 'Path to config file', 'path', 'scraper.config.json'],
    ['username', 'u', 'Username to login', 'email'],
    ['password', 'p', 'Password to login', 'string'],
    ['help', 'h', 'Show help'],
    ['version', 'v', 'Show version'],
    ['silent', 's', 'Supress messages'],
];

export const programOptionNames = Object.fromEntries(programOptionsInfo.map(([name]) => [name, name]));

export function nonewline() { }

function createLogger() {
    let silent = false;
    return [
        function log(...args) {
            if (silent)
                return;
            for (const arg of args) {
                if (arg === nonewline)
                    return;
                process.stdout.write(arg);
            }
            process.stdout.write('\n');
        },
        function setSilent(s) {
            silent = s;
        }
    ];
}

export const [log, setSilent] = createLogger();

export function exitWithError(message, _showHelp, exitCode = -1) {
    console.error(message);
    if (_showHelp)
        showHelp();
    process.exit(exitCode);
}
