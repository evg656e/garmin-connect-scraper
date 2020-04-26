import fs from 'fs';
import { parse as parsePath } from 'path';

const { promises } = fs;

export function readJSONFileSync(path) {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}

export async function readJSONFile(path) {
    return JSON.parse(await promises.readFile(path, 'utf8'));
}

export async function readJSONFileDefault(path, defaultData = {}) {
    try {
        return JSON.parse(await promises.readFile(path, 'utf8'));
    }
    catch (err) {
        if (err.code === 'ENOENT')
            return defaultData;
        throw err;
    }
}

export async function writeJSONFile(path, data) {
    return promises.writeFile(path, JSON.stringify(data, undefined, 2), 'utf8');
}

export async function makePath(path) {
    const { dir } = parsePath(path);
    if (dir !== '')
        return promises.mkdir(dir, { recursive: true });
}

export async function writeJSONPath(path, data) {
    await makePath(path);
    return writeJSONFile(path, data);
}
