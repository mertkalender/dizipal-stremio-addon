require("dotenv").config();
const { fetchNonce } = require("./src/scrapeProxyCookie");

var header = {
    "Accept-Language": "tr,en;q=0.9,en-GB;q=0.8,en-US;q=0.7",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Origin": "https://dizipal.bar",
    "Referer": "https://dizipal.bar/",
};

async function refreshNonce() {
    const nonce = await fetchNonce(process.env.PROXY_URL);
    if (nonce) {
        process.env.SEARCH_NONCE = nonce;
        console.log('[Header] Nonce güncellendi.');
    } else {
        console.warn('[Header] Nonce alınamadı.');
    }
}

refreshNonce();
setInterval(refreshNonce, 4 * 60 * 60 * 1000);

module.exports = header;
