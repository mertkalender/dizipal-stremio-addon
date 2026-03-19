require("dotenv").config();
const header = require("../header");
const sslfix = require("./sslfix");
const Axios = require('axios');
const { getProxyUrl } = require("./urlManager");

// Cache'siz axios — cookie'leri yakalamak için
const axios = Axios.create();

function extractCookies(responseHeaders) {
    const setCookie = responseHeaders['set-cookie'];
    if (!setCookie) return '';
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    return cookies.map(c => c.split(';')[0]).join('; ');
}

async function GetVideos(id) {
    try {
        const proxyUrl = await getProxyUrl();
        const pageUrl = proxyUrl + id;
        const response = await axios({ ...sslfix, url: pageUrl, headers: header, method: 'GET' });
        if (!response || response.status !== 200) return null;

        const html = response.data;

        // Extract data-cfg from player container
        const cfgMatch = html.match(/data-cfg="([^"]+)"/);
        if (!cfgMatch) {
            console.error('[Videos] data-cfg bulunamadı. pageUrl:', pageUrl);
            return null;
        }
        const cfg = cfgMatch[1];

        // Sayfanın set ettiği cookie'leri al (_ct CSRF token burada)
        const pageCookies = extractCookies(response.headers);

        // POST to ajax-player-config
        const configUrl = proxyUrl + '/ajax-player-config';
        const configRes = await axios({
            ...sslfix,
            url: configUrl,
            method: 'POST',
            headers: {
                ...header,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': pageUrl,
                'X-Requested-With': 'XMLHttpRequest',
                ...(pageCookies ? { 'Cookie': pageCookies } : {}),
            },
            data: `cfg=${encodeURIComponent(cfg)}`,
        });

        if (!configRes || configRes.status !== 200) {
            console.error('[Videos] ajax-player-config başarısız:', configRes?.status);
            return null;
        }

        const data = typeof configRes.data === 'string' ? JSON.parse(configRes.data) : configRes.data;
        if (!data.success || !data.config) {
            console.error('[Videos] config alınamadı:', JSON.stringify(data).slice(0, 200));
            return null;
        }

        const config = data.config;
        console.log(`[Videos] config: type=${config.t} url=${String(config.v).slice(0, 80)}`);

        if (config.t === 'iframe' || (config.t !== 'm3u8' && config.t !== 'mp4')) {
            const streamUrl = await scrapeEmbedUrl(config.v, pageUrl);
            if (!streamUrl) return null;
            return { url: streamUrl, embedUrl: config.v };
        }

        return { url: config.v, embedUrl: pageUrl };
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
