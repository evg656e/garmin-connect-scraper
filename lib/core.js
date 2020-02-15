export const has = Function.prototype.call.bind(Object.prototype.hasOwnProperty);

export function setDefault(obj, key, defaultValue) {
    return has(obj, key) ? obj[key] : obj[key] = defaultValue;
}

export function createCompilePath({ separator, accessor, validator, get } = createCompilePath.defaults) {
    return function compilePath(path) {
        const keys = path.replace(accessor, '.$1').split(separator).map(key => key.trim()).filter(key => validator.test(key));
        switch (keys.length) {
            case 0:
                throw new Error(`Invalid path: '${path}'`);
            case 1: {
                const key = keys[0];
                return function resolvePath(obj) {
                    if (obj === null || obj === undefined)
                        return obj;
                    return get(obj, key);
                };
            }
            default: {
                return function resolvePath(obj) {
                    let ret = obj;
                    for (let i = 0; i < keys.length; i++) {
                        if (ret === null || ret === undefined)
                            return ret;
                        ret = get(ret, keys[i]);
                    }
                    return ret;
                };
            }
        }
    };
}

createCompilePath.defaults = {
    separator: '.',
    accessor: /\[(.+?)\]/g,
    validator: /\w+/,
    get: (obj, key) => {
        if (Array.isArray(obj)) {
            const index = Number.parseInt(key);
            if (!Number.isNaN(index))
                return index < 0 ? obj[index + obj.length] : obj[index];
        }
        return obj[key];
    }
};

export const compilePath = createCompilePath();

export function evaluatePath(obj, path) {
    return compilePath(path)(obj);
}

export function createCompileTemplate({ interpolator, compile, pass } = createCompileTemplate.defaults) {
    return function compileTemplate(template) {
        const strings = [];
        const resolvers = [];

        let lastIndex = 0;
        for (const match of template.matchAll(interpolator)) {
            strings.push(template.substring(lastIndex, match.index));
            resolvers.push(compile(match[1]));
            lastIndex = match.index + match[0].length;
        }
        strings.push(template.substring(lastIndex));

        return function resolveTemplate(data) {
            let ret = strings[0];
            for (let i = 1; i < strings.length; i++)
                ret += pass(resolvers[i - 1](data)) + strings[i];
            return ret;
        };
    };
}

createCompileTemplate.defaults = {
    interpolator: /\{(.+?)\}/g,
    compile: compilePath,
    pass: value => value
};

export const compileTemplate = createCompileTemplate();

export function evaluateTemplate(template, data) {
    return compileTemplate(template)(data);
}

export function createPickPath(pathes, { separator, compile } = createPickPath.defaults) {
    const compiledPathes = pathes.map(path => path.split(separator)).map(([key, alias]) => [compile(key), alias ?? key]);
    return function pickPath(obj) {
        return Object.fromEntries(compiledPathes.map(([resolvePath, key]) => [key, resolvePath(obj)]))
    };
}

createPickPath.defaults = {
    separator: /\s+as\s+/,
    compile: compilePath
};

export function pick(obj, keys) {
    const ret = {};
    for (const key of keys)
        if (has(obj, key))
            ret[key] = obj[key];
    return ret;
}
