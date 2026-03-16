require("dotenv").config();
const header = require("../header");
const sslfix = require("./sslfix");
const cheerio = require("cheerio");
const Axios = require('axios');
const { setupCache } = require("axios-cache-interceptor");

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
        const pageUrl = process.env.PROXY_URL + id;
        console.log('[Videos] GET:', pageUrl);
        const response = await axios({ ...sslfix, url: pageUrl, headers: header, method: 'GET' });
        if (!response || response.status !== 200) return null;

        // Sayfa cookie'lerini topla
        let cookieJar = parseCookies(response.headers?.['set-cookie']);

        const $ = cheerio.load(response.data);
        const cfg = $('div.video-player-container').attr('data-cfg');
        if (!cfg) {
            console.log('[Videos] data-cfg bulunamadı');
            return null;
        }

        console.log('[Videos] cfg:', cfg);

        // ajax-token'dan CSRF token ve ek cookie al
        let csrfToken = '';
        try {
            const tokenRes = await axios({
                ...sslfix,
                url: process.env.PROXY_URL + '/ajax-token',
                method: 'GET',
                headers: { ...header, ...(Object.keys(cookieJar).length ? { 'Cookie': buildCookieHeader(cookieJar) } : {}) },
            });
            const newCookies = parseCookies(tokenRes.headers?.['set-cookie']);
            cookieJar = { ...cookieJar, ...newCookies };
            if (tokenRes.data?.t) {
                csrfToken = tokenRes.data.t;
                cookieJar['_ct'] = csrfToken;
                console.log('[Videos] token alındı:', csrfToken.slice(0, 8) + '...');
            }
        } catch (e) {
            console.log('[Videos] token alınamadı:', e.message);
        }

        const cookieStr = buildCookieHeader(cookieJar);
        console.log('[Videos] cookie jar:', cookieStr.slice(0, 60));

        const apiUrl = process.env.PROXY_URL + '/ajax-player-config';
        const apiResponse = await axios({
            ...sslfix,
            url: apiUrl,
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

        if (!apiResponse || !apiResponse.data || !apiResponse.data.success) {
            console.log('[Videos] ajax-player-config başarısız:', apiResponse?.data);
            return null;
        }

        const config = apiResponse.data.config;
        let videoUrl = config.v;
        const videoType = config.t || '';
        const subtitleRaw = config.s || config.subtitle || '';

        let subtitles;
        if (subtitleRaw) {
            subtitles = subtitleRaw.split(',').filter(Boolean);
        }

        console.log('[Videos] embed url:', videoUrl, 'type:', videoType);

        // Embed sayfasıysa asıl stream URL'sini çıkar
        if (videoUrl && (videoType === 'embed' || videoType === 'iframe' || videoUrl.includes('.html'))) {
            const streamUrl = await scrapeEmbedUrl(videoUrl, pageUrl);
            if (streamUrl) {
                videoUrl = streamUrl;
            }
        }

        console.log('[Videos] video url:', videoUrl);
        return { url: videoUrl, subtitles };
    } catch (error) {
        console.log('[Videos] hata:', error.message);
        return null;
    }
}

async function scrapeEmbedUrl(embedUrl, referer) {
    try {
        console.log('[Videos] embed scraping:', embedUrl);
        const embedHeader = {
            ...header,
            'Referer': referer || process.env.PROXY_URL,
        };
        const res = await axios({ ...sslfix, url: embedUrl, method: 'GET', headers: embedHeader });
        if (!res || res.status !== 200) return null;

        const html = res.data;

        // Playerjs({file:"..."}) formatı
        const fileMatch = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
        if (fileMatch) {
            console.log('[Videos] embed stream bulundu (playerjs):', fileMatch[1].slice(0, 60));
            return fileMatch[1];
        }

        // sources: [{file:"..."}] formatı
        const sourcesMatch = html.match(/sources\s*:\s*\[.*?file\s*:\s*["']([^"']+)["']/is);
        if (sourcesMatch) {
            console.log('[Videos] embed stream bulundu (sources):', sourcesMatch[1].slice(0, 60));
            return sourcesMatch[1];
        }

        // doğrudan m3u8/mp4 URL
        const directMatch = html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
        if (directMatch) {
            console.log('[Videos] embed stream bulundu (direct):', directMatch[1].slice(0, 60));
            return directMatch[1];
        }

        console.log('[Videos] embed içinde stream bulunamadı');
        return null;
    } catch (e) {
        console.log('[Videos] embed scrape hatası:', e.message);
        return null;
    }
}

module.exports = { GetVideos }