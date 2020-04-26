import { homedir } from 'os';
import puppeteer from 'puppeteer';
import minimist from 'minimist';
import {
    log,
    setSilent,
    exitWithError,
    showHelp,
    showVersion,
    programOptionsInfo,
    programOptionNames
} from './cli.js';
import {
    setDefault,
    evaluateTemplate,
    createPickPath,
    pick,
    compileTemplate
} from './core.js';
import {
    readJSONFileDefault,
    writeJSONPath
} from './fs.js';
import {
    validateCredentials,
    validateConfig,
    validateActivities
} from './schema.js';
import { buildUrl } from './url.js';

function logged(fn, begin, end, error) {
    begin = begin !== undefined ? compileTemplate(begin) : begin;
    end = end !== undefined ? compileTemplate(end) : end;
    error = error !== undefined ? compileTemplate(error) : error;

    return async function (...args) {
        try {
            if (begin !== undefined)
                log(begin(args));
            const ret = await fn(...args);
            if (end !== undefined)
                log(end([...args, ret]));
            return ret;
        }
        catch (err) {
            if (error !== undefined)
                log(error([...args, err]));
            throw err;
        }
    };
}

function createDelayedQueue(delay) {
    const queue = [];
    let timerId = null;

    function consume() {
        timerId = null;
        queue.pop();
        if (queue.length !== 0)
            consumeNext(queue[queue.length - 1][0]);
    }

    function consumeNext(callbackfn) {
        callbackfn();
        timerId = setTimeout(consume, delay);
    }

    return [
        function enqueue(callbackfn, clearfn) {
            queue.unshift([callbackfn, clearfn]);
            if (queue.length === 1)
                consumeNext(callbackfn);
        },
        function clear() {
            if (timerId !== null) {
                clearTimeout(timerId);
                timerId = null;
            }
            while (queue.length !== 0) {
                const clearfn = queue.pop()[1];
                if (clearfn !== undefined)
                    clearfn();
            }
        }
    ];
}

const launchBrowser = logged(async function launchBrowser(config) {
    const options = { ...config.puppeteer?.launchOptions };

    const requestDelay = config.general?.requestDelay ?? 5000;
    const [enqueue, clear] = createDelayedQueue(requestDelay);

    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', request => {
        const headers = request.headers();
        const { queued, hint } = headers;
        if (queued) {
            enqueue(() => {
                log(`Fetching ${request.url()}${hint ? ' ' + hint : ''}...`);
                delete headers.hint;
                delete headers.queued;
                request.continue({ headers });
            });
            return;
        }
        request.continue();
    });

    return [page, clear];
}, 'Launching browser...', 'Browser launched.');

async function evaluateFetch(page, url, hint = '') {
    const ret = await page.evaluate(async (url, hint) => {
        const response = await fetch(url, {
            headers: {
                queued: true,
                hint
            }
        });
        const json = await response.json();
        return json;
    }, url, hint);
    log(`${url} fetched.`);
    return ret;
}

const signin = logged(async function signin(page, { username, password }, remember = false) {
    await page.goto('https://connect.garmin.com/signin', { waitUntil: 'networkidle0' });

    const elementHandle = await page.$('#gauth-widget-frame-gauth-widget');
    const frame = await elementHandle.contentFrame();

    await frame.type('#username', username);
    await frame.type('#password', password);

    if (remember)
        await frame.click('#login-remember');

    const [response] = await Promise.all([
        frame.waitForNavigation({ waitUntil: 'networkidle0' }),
        frame.click('#login-btn-signin'),
    ]);

    if (!response.ok())
        throw new Error(`Sign in failed, response code: ${response.status()}`);

    await page.waitForNavigation({ waitUntil: 'networkidle0' });
}, 'Signing in as {[1].username}...', 'Signed in.');

function pickAll(obj) {
    return { ...obj };
}

function pickNotNull(obj) {
    return Object.fromEntries(Object.entries(obj).filter(([_, value]) => value != null));
}

function normalizePathes(pathes, defaults = []) {
    const ret = pathes.slice();
    for (const path of defaults) {
        const index = ret.indexOf(path);
        if (index === -1)
            ret.unshift(path);
    }
    return ret;
}

function createPick(defaultPickPolicy, pathes, defaultPathes) {
    if (pathes !== undefined)
        return createPickPath(normalizePathes(pathes, defaultPathes));
    switch (defaultPickPolicy.toLowerCase()) {
        case 'notnull':
            return pickNotNull;
        case 'all':
        default:
            return pickAll;
    }
}

const activitiesSearchBaseUrl = 'https://connect.garmin.com/modern/proxy/activitylist-service/activities/search/activities';

const updateActivities = logged(async function updateActivities(page, searchParameters = {}, oldActivities = [], pick = pickAll, finish) {
    const latestActivityId = oldActivities[0]?.activityId ?? -1;
    const newActivities = [];

    searchParameters = { start: 0, limit: 20, ...searchParameters };

    let { start, limit } = searchParameters;

    for (; finish === undefined || start < finish; start += limit) {
        searchParameters.start = start;
        searchParameters.limit = limit;

        const activitiesChunk = await evaluateFetch(page, buildUrl(activitiesSearchBaseUrl, searchParameters));

        if (activitiesChunk.length === 0
            || activitiesChunk.some((activity) => {
                if (latestActivityId === activity.activityId)
                    return true;
                newActivities.push(pick(activity));
            }))
            break;
    }

    return newActivities;
}, 'Updating activities...', 'Activities updated, got {[-1].length} new activities.');


const writeDetails = logged(function writeDetails(path, details) {
    return writeJSONPath(path, details);
}, 'Writing {0}...', '{0} written.');

function fetchActivityDetails(page, newActivities, { url, path, pick }, env, defaultPickPolicy) {
    const resolveUrl = compileTemplate(url);
    const resolvePath = compileTemplate(path);
    const pickDetails = createPick(defaultPickPolicy, pick);
    return Promise.all(newActivities.map(async (activity, index) => {
        const json = await evaluateFetch(page, resolveUrl(activity), newActivities.length > 1 ? `(${index + 1} of ${newActivities.length})` : '');
        return writeDetails(resolvePath({ ...env, ...activity }), pickDetails(json));
    }));
}

const fetchActivityDetailsAll = logged(function fetchActivityDetailsAll(page, newActivities, fetches, env, defaultPickPolicy) {
    return Promise.all(fetches.map(fetch => fetchActivityDetails(page, newActivities, fetch, env, defaultPickPolicy)));
}, 'Fetching activity details...', 'Activity details fetched.');

function fetchActivityDetailsAllHelper(page, newActivities, fetches, env, defaultPickPolicy) {
    if (fetches.length === 0)
        return Promise.resolve();
    return fetchActivityDetailsAll(page, newActivities, fetches, env, defaultPickPolicy);
}

const readActivities = logged(async function readActivities(path) {
    return validateActivities(await readJSONFileDefault(path, []));
}, 'Reading {0}...', '{0} read.');

const writeActivities = logged(function writeActivities(path, activities) {
    return writeJSONPath(path, activities);
}, 'Writing {0}...', '{0} written.');

async function updateActivitiesAll(page, { activities }, env, defaultPickPolicy) {
    const {
        search,
        fetch
    } = {
        search: {},
        fetch: [],
        ...activities
    };

    const {
        parameters,
        finish,
        path,
        pick
    } = {
        parameters: {},
        path: 'activities.json',
        ...search
    };

    const resolvedPath = evaluateTemplate(path, { ...env, ...parameters });

    const oldActivities = await readActivities(resolvedPath);
    const newActivities = await updateActivities(page, parameters, oldActivities, createPick(defaultPickPolicy, pick, ['activityId']), finish);

    if (newActivities.length === 0)
        return;

    return Promise.all([
        writeActivities(resolvedPath, newActivities.concat(oldActivities)),
        fetchActivityDetailsAllHelper(page, newActivities, fetch, env, defaultPickPolicy)
    ]);
}

function parseOptions(args, optionsInfo) {
    const options = {};

    for (const [name, alias, _, placeholder, _default] of optionsInfo) {
        if (alias)
            setDefault(options, 'alias', {})[alias] = name;
        if (placeholder)
            setDefault(options, 'string', []).push(name);
        else
            setDefault(options, 'boolean', []).push(name);
        if (_default !== undefined)
            setDefault(options, 'default', {})[name] = _default;
    }

    return minimist(args, options);
}

const readConfig = logged(async function readConfig(path) {
    return validateConfig(await readJSONFileDefault(path, {}));
}, 'Reading config {0}...', 'Config read.');

const closeBrowser = logged(function closeBrowser(page) {
    return page.browser().close();
}, 'Closing browser...', 'Browser closed.');

function toPosixSep(path) {
    return path.replace(/\\/g, '/');
}

function createEnv({ general }) {
    const now = new Date().toISOString();
    const T = now.indexOf('T');
    const Z = -5;
    const cwd = toPosixSep(process.cwd());
    const env = {
        currentDate: now.slice(0, T),
        currentTime: now.slice(T + 1, Z),
        cwd,
        homeDir: toPosixSep(homedir())
    };
    env.baseDir = evaluateTemplate(general?.baseDir ?? cwd, env);
    return env;
}

export async function main() {
    try {
        const {
            config: configKey,
            help: helpKey,
            version: versionKey,
            username: usernameKey,
            password: passwordKey,
            silent: silentKey
        } = programOptionNames;

        const options = parseOptions(process.argv.slice(2), programOptionsInfo);

        setSilent(options[silentKey]);

        if (options[helpKey]) {
            showHelp(0);
        }

        if (options[versionKey]) {
            showVersion(0);
        }

        const config = await readConfig(options[configKey]);
        const credentials = validateCredentials({ ...config.credentials, ...pick(options, [usernameKey, passwordKey]) });

        const env = createEnv(config);

        const defaultPickPolicy = config.general?.defaultPickPolicy ?? 'all';

        const [page, clearRequestQueue] = await launchBrowser(config);
        await signin(page, credentials);
        await updateActivitiesAll(page, config, env, defaultPickPolicy);

        clearRequestQueue();
        await closeBrowser(page);
    }
    catch (err) {
        exitWithError(err.message);
    }
}
