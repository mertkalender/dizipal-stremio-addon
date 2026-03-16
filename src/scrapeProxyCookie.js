const Axios = require('axios');

async function fetchNonce(workerUrl) {
    try {
        const response = await Axios.get(workerUrl, { timeout: 30000 });
        const html = response.data;

        let nonce = null;
        const match = html.match(/live_search_params\s*=\s*\{[^}]*"nonce"\s*:\s*"([^"]+)"/);
        if (match) nonce = match[1];
        if (!nonce) {
            const fallback = html.match(/"nonce"\s*:\s*"([^"]+)"/);
            if (fallback) nonce = fallback[1];
        }

        if (nonce) console.log(`[Nonce] Alındı: ${nonce}`);
        else console.warn('[Nonce] Bulunamadı.');

        return nonce;
    } catch (error) {
        console.error('[Nonce] Fetch hatası:', error.message);
        return null;
    }
}

module.exports = { fetchNonce };
