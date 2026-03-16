const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteerExtra.use(StealthPlugin());

const EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';

async function fetchCookiesWithPuppeteer(url) {
    let browser = null;
    try {
        browser = await puppeteerExtra.launch({
            headless: true,
            executablePath: EXECUTABLE_PATH,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--window-size=1280,720',
            ],
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });

        // İlk yükleme - CF challenge sayfası gelebilir
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });

        // CF challenge varsa navigate edecek, bitene kadar bekle
        try {
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        } catch (_) {}

        // CF hâlâ devam ediyorsa daha uzun bekle
        try {
            await page.waitForFunction(
                () => !document.title.includes('Just a moment') && !document.title.includes('Attention Required'),
                { timeout: 60000, polling: 2000 }
            );
        } catch (_) {}

        // Sayfa tamamen yüklenene kadar bekle
        try {
            await page.waitForNetworkIdle({ timeout: 10000 });
        } catch (_) {}

        const html = await page.content();
        const cookies = await page.cookies();
        const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

        let nonce = null;
        const match = html.match(/live_search_params\s*=\s*\{[^}]*"nonce"\s*:\s*"([^"]+)"/);
        if (match) nonce = match[1];
        if (!nonce) {
            const fallback = html.match(/"nonce"\s*:\s*"([^"]+)"/);
            if (fallback) nonce = fallback[1];
        }

        const userAgent = await page.evaluate(() => navigator.userAgent);

        console.log(`[Cookie] ${cookies.length} cookie alındı: ${url}`);
        if (nonce) console.log(`[Cookie] Search nonce alındı: ${nonce}`);
        else console.warn('[Cookie] Nonce alınamadı.');

        return { cookies: cookieStr || null, nonce: nonce || null, userAgent, sessionId: null };
    } catch (error) {
        console.error('[Cookie] Puppeteer hatası:', error.message);
        return { cookies: null, nonce: null, sessionId: null };
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

module.exports = { fetchCookiesWithPuppeteer };
