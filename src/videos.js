require("dotenv").config();
const header = require("../header");
const sslfix = require("./sslfix");
const cheerio = require("cheerio");
const Axios = require('axios');
const { setupCache } = require("axios-cache-interceptor");

const instance = Axios.create();
const axios = setupCache(instance);

async function GetVideos(id) {
    try {
        const pageUrl = process.env.PROXY_URL + id;
        console.log('[Videos] GET:', pageUrl);
        const response = await axios({ ...sslfix, url: pageUrl, headers: header, method: 'GET' });
        if (!response || response.status !== 200) return null;

        const $ = cheerio.load(response.data);
        const cfg = $('div.video-player-container').attr('data-cfg');
        if (!cfg) {
            console.log('[Videos] data-cfg bulunamadı');
            return null;
        }

        console.log('[Videos] cfg:', cfg);
        const apiUrl = process.env.PROXY_URL + '/ajax-player-config';
        const apiResponse = await axios({
            ...sslfix,
            url: apiUrl,
            method: 'POST',
            headers: { ...header, 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': pageUrl },
            data: `cfg=${cfg}`,
        });

        if (!apiResponse || !apiResponse.data || !apiResponse.data.success) {
            console.log('[Videos] ajax-player-config başarısız:', apiResponse?.data);
            return null;
        }

        const config = apiResponse.data.config;
        const videoUrl = config.v;
        const subtitleRaw = config.s || config.subtitle || '';

        let subtitles;
        if (subtitleRaw) {
            subtitles = subtitleRaw.split(',').filter(Boolean);
        }

        console.log('[Videos] video url:', videoUrl);
        return { url: videoUrl, subtitles };
    } catch (error) {
        console.log('[Videos] hata:', error.message);
        return null;
    }
}

module.exports = { GetVideos }