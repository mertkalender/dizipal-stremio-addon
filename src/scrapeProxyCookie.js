const Axios = require('axios');

async function fetchCookiesWithPuppeteer(url) {
    try {
        console.log('[Cookie] FlareSolverr ile istek yapılıyor...');
        const response = await Axios.post('http://localhost:8191/v1', {
            cmd: 'request.get',
            url: url,
            maxTimeout: 60000,
        }, { timeout: 90000 });

        const data = response.data;

        if (!data || data.status !== 'ok') {
            console.warn('[Cookie] FlareSolverr başarısız:', data?.message);
            return { cookies: null, nonce: null };
        }

        const cookies = (data.solution?.cookies || [])
            .map(c => `${c.name}=${c.value}`)
            .join('; ');

        const html = data.solution?.response || '';
        let nonce = null;

        // live_search_params.nonce değerini HTML'den çek
        const match = html.match(/live_search_params\s*=\s*\{[^}]*"nonce"\s*:\s*"([^"]+)"/);
        if (match) nonce = match[1];

        // Fallback: genel "nonce" alanı
        if (!nonce) {
            const fallback = html.match(/"nonce"\s*:\s*"([^"]+)"/);
            if (fallback) nonce = fallback[1];
        }

        console.log(`[Cookie] ${data.solution?.cookies?.length || 0} cookie alındı: ${url}`);
        if (nonce) console.log(`[Cookie] Search nonce alındı: ${nonce}`);
        else console.warn('[Cookie] Nonce alınamadı.');

        const userAgent = data.solution?.userAgent || null;
        return { cookies: cookies || null, nonce: nonce || null, userAgent };
    } catch (error) {
        console.error('[Cookie] FlareSolverr hatası:', error.message);
        return { cookies: null, nonce: null };
    }
}

module.exports = { fetchCookiesWithPuppeteer };
