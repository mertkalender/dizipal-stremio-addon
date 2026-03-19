require('dotenv').config();
const Axios = require('axios');
const sslfix = require('./sslfix');
const header = require('../header');

const axios = Axios.create();

let workingUrl = process.env.PROXY_URL;
let lastChecked = 0;
const CHECK_INTERVAL = 20 * 60 * 1000; // 20 dakikada bir yeniden kontrol

function extractNumber(url) {
    const m = url.match(/dizipal(\d+)/i);
    return m ? parseInt(m[1]) : null;
}

function buildUrl(num) {
    return process.env.PROXY_URL.replace(/dizipal\d+/i, `dizipal${num}`);
}

async function findWorkingUrl() {
    const baseNum = extractNumber(workingUrl) || extractNumber(process.env.PROXY_URL);
    if (!baseNum) return workingUrl;

    for (let i = 0; i <= 10; i++) {
        const num = baseNum + i;
        const url = buildUrl(num);
        try {
            const res = await axios({ ...sslfix, url, method: 'GET', headers: header, timeout: 6000 });
            if (res.status === 200 && String(res.data).includes('window.appDomain')) {
                if (url !== workingUrl) console.log(`[URLManager] Yeni çalışan URL: ${url}`);
                workingUrl = url;
                lastChecked = Date.now();
                return url;
            }
        } catch (_) {
        }
    }
    return workingUrl;
}

async function getProxyUrl() {
    if (Date.now() - lastChecked > CHECK_INTERVAL) {
        return await findWorkingUrl();
    }
    return workingUrl;
}

// Başlangıçta hemen kontrol et
findWorkingUrl().catch(() => {});

module.exports = { getProxyUrl };
