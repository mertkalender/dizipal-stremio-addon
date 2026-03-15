require("dotenv").config();
const { fetchCookiesWithPuppeteer } = require("./src/scrapeProxyCookie");
const { fetchWithUrl } = require("./src/getUrlApi");

var header = {
    "Accept-Language": "tr,en;q=0.9,en-GB;q=0.8,en-US;q=0.7",
    "Sec-Ch-Ua-Platform": "Windows",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Cookie": "",
    "Origin": process.env.PROXY_URL,
    "Referer": process.env.PROXY_URL,
};

async function refreshCookies() {
    try {
        // URLGETSTATUS=true ise GitHub'dan güncel URL'yi çek
        const urlFromApi = await fetchWithUrl();
        if (urlFromApi) {
            process.env.PROXY_URL = urlFromApi;
            header.Origin = urlFromApi;
            header.Referer = urlFromApi;
        }

        const targetUrl = process.env.PROXY_URL;
        if (!targetUrl) {
            console.error('[Header] PROXY_URL tanımlı değil. .env dosyasını kontrol et.');
            return;
        }

        console.log(`[Header] Cookie yenileniyor: ${targetUrl}`);
        const result = await fetchCookiesWithPuppeteer(targetUrl);

        if (result.cookies) {
            header.Cookie = result.cookies;
            console.log('[Header] Cookie başarıyla güncellendi.');
        } else {
            console.warn('[Header] Cookie alınamadı, önceki değer korunuyor.');
        }

        if (result.nonce) {
            process.env.SEARCH_NONCE = result.nonce;
        }
    } catch (error) {
        console.error('[Header] Cookie yenileme hatası:', error.message);
    }
}

// Başlangıçta cookie al
refreshCookies();

// Her 4 saatte bir yenile
setInterval(refreshCookies, 4 * 60 * 60 * 1000);

module.exports = header;
