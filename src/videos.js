require("dotenv").config();
const header = require("../header");
const sslfix = require("./sslfix");
const cheerio = require("cheerio");
const Axios = require('axios');
const { setupCache } = require("axios-cache-interceptor");
const { getProxyUrl } = require("./urlManager");

const instance = Axios.create();
const axios = setupCache(instance);

function parseCookies(setCookieHeader) {
    if (!setCookieHeader) return {};
    const cookies = {};
    const list = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    for (const entry of list) {
        const part = entry.split(';')[0].trim();
        const eq = part.indexOf('=');
        if (eq > 0) cookies[part.slice(0, eq)] = part.slice(eq + 1);
    }
    return cookies;
}

function buildCookieHeader(cookieObj) {
    return Object.entries(cookieObj).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function GetVideos(id) {
    try {
        const proxyUrl = await getProxyUrl();
        const pageUrl = proxyUrl + id;
        const response = await axios({ ...sslfix, url: pageUrl, headers: header, method: 'GET' });
        if (!response || response.status !== 200) return null;

        let cookieJar = parseCookies(response.headers?.['set-cookie']);

        const $ = cheerio.load(response.data);
        const cfg = $('div.video-player-container').attr('data-cfg');
        if (!cfg) return null;

        try {
            const tokenRes = await axios({
                ...sslfix,
                url: proxyUrl + '/ajax-token',
                method: 'GET',
                headers: { ...header, ...(Object.keys(cookieJar).length ? { 'Cookie': buildCookieHeader(cookieJar) } : {}) },
            });
            const newCookies = parseCookies(tokenRes.headers?.['set-cookie']);
            cookieJar = { ...cookieJar, ...newCookies };
            if (tokenRes.data?.t) cookieJar['_ct'] = tokenRes.data.t;
        } catch (_) {}

        const cookieStr = buildCookieHeader(cookieJar);
        const apiResponse = await axios({
            ...sslfix,
            url: proxyUrl + '/ajax-player-config',
            method: 'POST',
            headers: {
                ...header,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': pageUrl,
                'X-Requested-With': 'XMLHttpRequest',
                ...(cookieStr ? { 'Cookie': cookieStr } : {}),
            },
            data: `cfg=${encodeURIComponent(cfg)}`,
        });

        if (!apiResponse?.data?.success) return null;

        const config = apiResponse.data.config;
        let videoUrl = config.v;
        const videoType = config.t || '';
        const subtitleRaw = config.s || config.subtitle || '';
        const subtitles = subtitleRaw ? subtitleRaw.split(',').filter(Boolean) : undefined;

        if (videoUrl && (videoType === 'embed' || videoType === 'iframe' || videoUrl.includes('.html'))) {
            const streamUrl = await scrapeEmbedUrl(videoUrl, pageUrl);
            if (streamUrl) videoUrl = streamUrl;
        }

        return { url: videoUrl, subtitles, embedUrl: config.v };
    } catch (error) {
        console.error('[Videos] hata:', error.message);
        return null;
    }
}

async function scrapeEmbedUrl(embedUrl, referer) {
    try {
        const res = await axios({ ...sslfix, url: embedUrl, method: 'GET', headers: { ...header, 'Referer': referer } });
        if (!res || res.status !== 200) return null;

        const html = res.data;
        const fileMatch = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
        if (fileMatch) return fileMatch[1];

        const sourcesMatch = html.match(/sources\s*:\s*\[.*?file\s*:\s*["']([^"']+)["']/is);
        if (sourcesMatch) return sourcesMatch[1];

        const directMatch = html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
        if (directMatch) return directMatch[1];

        return null;
    } catch (_) {
        return null;
    }
}

module.exports = { GetVideos }
