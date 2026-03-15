const Axios = require('axios');

const FLARESOLVERR = 'http://localhost:8191/v1';

async function fetchCookiesWithPuppeteer(url) {
    let sessionId = null;
    try {
        // Session oluştur
        const sessionRes = await Axios.post(FLARESOLVERR, { cmd: 'sessions.create' }, { timeout: 30000 });
        sessionId = sessionRes.data?.session;
        console.log('[Cookie] FlareSolverr session:', sessionId);

        // GET isteği - CF bypass + cookie + nonce
        const response = await Axios.post(FLARESOLVERR, {
            cmd: 'request.get',
            url: url,
            session: sessionId,
            maxTimeout: 60000,
        }, { timeout: 90000 });

        const data = response.data;
        if (!data || data.status !== 'ok') {
            console.warn('[Cookie] FlareSolverr başarısız:', data?.message);
            return { cookies: null, nonce: null, sessionId: null };
        }

        const cookies = (data.solution?.cookies || [])
            .map(c => `${c.name}=${c.value}`)
            .join('; ');

        const html = data.solution?.response || '';
        let nonce = null;

        const match = html.match(/live_search_params\s*=\s*\{[^}]*"nonce"\s*:\s*"([^"]+)"/);
        if (match) nonce = match[1];
        if (!nonce) {
            const fallback = html.match(/"nonce"\s*:\s*"([^"]+)"/);
            if (fallback) nonce = fallback[1];
        }

        const userAgent = data.solution?.userAgent || null;

        console.log(`[Cookie] ${data.solution?.cookies?.length || 0} cookie alındı: ${url}`);
        if (nonce) console.log(`[Cookie] Search nonce alındı: ${nonce}`);
        else console.warn('[Cookie] Nonce alınamadı.');

        return { cookies: cookies || null, nonce: nonce || null, userAgent, sessionId };
    } catch (error) {
        console.error('[Cookie] FlareSolverr hatası:', error.message);
        if (sessionId) {
            await Axios.post(FLARESOLVERR, { cmd: 'sessions.destroy', session: sessionId }).catch(() => {});
        }
        return { cookies: null, nonce: null, sessionId: null };
    }
}

async function searchWithSession(url, postData) {
    const sessionId = process.env.FS_SESSION_ID;
    if (!sessionId) {
        console.warn('[Search] FlareSolverr session yok');
        return null;
    }
    try {
        const response = await Axios.post(FLARESOLVERR, {
            cmd: 'request.post',
            url: url,
            postData: postData,
            session: sessionId,
            maxTimeout: 60000,
        }, { timeout: 90000 });

        if (!response.data || response.data.status !== 'ok') {
            console.warn('[Search] FlareSolverr POST başarısız:', response.data?.message);
            return null;
        }
        return response.data.solution?.response || null;
    } catch (error) {
        console.error('[Search] FlareSolverr POST hatası:', error.message);
        return null;
    }
}

module.exports = { fetchCookiesWithPuppeteer, searchWithSession };
