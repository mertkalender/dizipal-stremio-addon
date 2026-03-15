const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

async function fetchCookiesWithPuppeteer(url) {
    let browser;
    try {
        const launchOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
            ],
        };

        // Docker/Linux ortamında sistem Chromium kullan
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        }

        browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();

        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
        );

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Cloudflare challenge tamamlanana kadar bekle
        try {
            await page.waitForFunction(
                () => document.title !== 'Just a moment...',
                { timeout: 30000 }
            );
        } catch (e) {
            console.warn('[Cookie] Cloudflare challenge timeout, devam ediliyor.');
        }

        const cookies = await page.cookies();
        const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

        // Arama nonce'unu sayfadan çek
        const nonce = await page.evaluate(() => {
            return (typeof live_search_params !== 'undefined' && live_search_params.nonce)
                ? live_search_params.nonce
                : null;
        });

        console.log(`[Cookie] ${cookies.length} cookie alındı: ${url}`);
        if (nonce) console.log(`[Cookie] Search nonce alındı: ${nonce}`);

        return { cookies: cookieString || null, nonce: nonce || null };
    } catch (error) {
        console.error('[Cookie] Puppeteer hatası:', error.message);
        return { cookies: null, nonce: null };
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { fetchCookiesWithPuppeteer };
