import querystring from 'querystring';

export function buildUrl(baseUrl, queryParams, sep = '?') {
    return [baseUrl, querystring.stringify(queryParams)].join(sep);
}
