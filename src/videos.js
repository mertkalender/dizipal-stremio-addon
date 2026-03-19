require("dotenv").config();
const header = require("../header");
const sslfix = require("./sslfix");
const cheerio = require("cheerio");
const Axios = require('axios');
const { setupCache } = require("axios-cache-interceptor");
const { getProxyUrl } = require("./urlManager");
const crypto = require('crypto');

const instance = Axios.create();
const axios = setupCache(instance);

function decryptPlayerUrl(appCKey, dataJson) {
    try {
        const data = JSON.parse(dataJson);
        const salt = Buffer.from(data.salt, 'hex');
        const iv = Buffer.from(data.iv, 'hex');
        const ciphertext = Buffer.from(data.ciphertext, 'base64');
        // PBKDF2 SHA-512, keySize=8 words=32 bytes, iterations=1015
        const key = crypto.pbkdf2Sync(appCKey, salt, 1015, 32, 'sha512');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return decrypted.toString('utf8');
    } catch (_) {
        return null;
    }
}

async function GetVideos(id) {
    try {
        const proxyUrl = await getProxyUrl();
        const pageUrl = proxyUrl + id;
        const response = await axios({ ...sslfix, url: pageUrl, headers: header, method: 'GET' });
        if (!response || response.status !== 200) return null;

        const html = response.data;
        const $ = cheerio.load(html);

        // Extract appCKey from script tag
        const appCKeyMatch = html.match(/window\.appCKey\s*=\s*['"]([^'"]+)['"]/);
        if (!appCKeyMatch) { console.error('[Videos] appCKey bulunamadı'); return null; }
        const appCKey = appCKeyMatch[1];

        // Extract encrypted player data
        const rmkEl = $('[data-rm-k="true"]');
        if (!rmkEl.length) { console.error('[Videos] data-rm-k elementi bulunamadı'); return null; }
        const dataJson = rmkEl.text().trim();
        if (!dataJson) { console.error('[Videos] data-rm-k boş'); return null; }

        // Decrypt to get iframe/embed URL
        const embedUrl = decryptPlayerUrl(appCKey, dataJson);
        console.log(`[Videos] decrypt sonucu: ${embedUrl}`);
        if (!embedUrl) return null;

        // Scrape the embed page for the actual stream URL
        const streamUrl = await scrapeEmbedUrl(embedUrl, pageUrl);
        console.log(`[Videos] stream URL: ${streamUrl}`);
        if (!streamUrl) return null;

        return { url: streamUrl, embedUrl };
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
