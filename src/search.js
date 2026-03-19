require("dotenv").config();
const header = require("../header");
const sslfix = require("./sslfix");
const cheerio = require("cheerio");
const Axios = require('axios');
const { getProxyUrl } = require("./urlManager");

const axios = Axios.create();

function extractPath(href) {
    try {
        return new URL(href).pathname;
    } catch {
        return href.replace(/https?:\/\/[^/]+/, '');
    }
}

function getTypeFromUrl(url) {
    if (url.includes('/dizi/') || url.includes('/anime/')) return 'series';
    return 'movie';
}

async function SearchMovieAndSeries(name) {
    try {
        const proxyUrl = await getProxyUrl();
        const searchUrl = `${proxyUrl}/arama?q=${encodeURIComponent(name)}`;
        const response = await axios({ ...sslfix, url: searchUrl, method: 'GET', headers: header });
        if (!response.data) return {};

        const $ = cheerio.load(response.data);
        const results = {};

        $('article.content-card').each((i, card) => {
            const href = $(card).find('a.card-link').attr('href') || '';
            if (!href) return;

            const title = $(card).find('h3.card-title').text().trim();
            if (!title) return;

            const poster = $(card).find('img').attr('data-src') || $(card).find('img').attr('src') || '';
            const type = getTypeFromUrl(href);
            const urlPath = extractPath(href);

            results[urlPath] = { url: urlPath, title, poster, type, genres: '' };
        });

        return results;
    } catch (error) {
        console.error('[Search] hatası:', error.message);
        return {};
    }
}

async function SearchMetaMovieAndSeries(id, type) {
    try {
        const proxyUrl = await getProxyUrl();
        const response = await axios({ ...sslfix, url: proxyUrl + id, headers: header, method: 'GET' });
        if (!response || response.status !== 200) return null;

        const $ = cheerio.load(response.data);

        const name = $('meta[property="og:title"]').attr('content')?.replace(/\s*[-|]\s*Dizipal.*$/i, '').trim()
            || $('title').text().replace(/\s*[-|]\s*Dizipal.*$/i, '').trim();

        const background = $('meta[property="og:image"]').attr('content') || '';
        const description = $('meta[property="og:description"]').attr('content') || '';

        let maxSeason = 1;
        $('a[href*="/bolum/"]').each((i, el) => {
            const href = $(el).attr('href') || '';
            const m = href.match(/(\d+)x\d+/) || href.match(/-(\d+)-sezon-\d+-bolum/);
            if (m) maxSeason = Math.max(maxSeason, parseInt(m[1]));
        });
        console.log(`[Search] meta → ${id} | maxSeason: ${maxSeason}`);

        const html = response.data;
        const yearMatch = html.match(/(20\d\d)/);
        const releaseInfo = yearMatch ? yearMatch[1] : '';

        const isYerli = html.toLowerCase().includes('yerli');
        const country = isYerli ? 'TR' : 'US';

        const genres = [];
        $('a[href*="/kategori/"]').each((i, el) => {
            const g = $(el).text().trim();
            if (g) genres.push(g);
        });

        return { name, background, country, genres, season: maxSeason, imdbRating: 0, description, releaseInfo };
    } catch (error) {
        console.error('[Search] meta hatası:', error.message);
        return null;
    }
}

async function SearchDetailMovieAndSeries(id, type, season) {
    try {
        if (type !== 'series') return [{ id }];

        const proxyUrl = await getProxyUrl();
        const url = `${proxyUrl}${id}`;
        const response = await axios({ ...sslfix, url, headers: header, method: 'GET' });
        if (!response || response.status !== 200) return [{}];

        const $ = cheerio.load(response.data);
        const episodes = [];
        const seen = new Set();

        const allBolumLinks = $('a[href*="/bolum/"]');
        console.log(`[Search] detay → URL: ${url} | sezon: ${season} | /bolum/ link sayısı: ${allBolumLinks.length}`);
        if (allBolumLinks.length > 0) {
            const samples = [];
            allBolumLinks.slice(0, 5).each((i, el) => samples.push($(el).attr('href')));
            console.log(`[Search] ilk 5 link:`, samples);
        }

        allBolumLinks.each((i, el) => {
            const href = $(el).attr('href') || '';
            // Format 1: prens-3x2-c04
            let slugMatch = href.match(/(\d+)x(\d+)-/);
            // Format 2: gibi-1-sezon-1-bolum
            if (!slugMatch) slugMatch = href.match(/-(\d+)-sezon-(\d+)-bolum/);
            if (!slugMatch) return;
            if (parseInt(slugMatch[1]) !== season) return;

            const epNum = parseInt(slugMatch[2]);
            const epPath = extractPath(href);
            if (seen.has(epPath)) return;
            seen.add(epPath);

            const title = $(el).find('.title').text().trim()
                || `${season}. Sezon ${epNum}. Bölüm`;

            episodes.push({ id: epPath, title, thumbnail: '', episode: epNum });
        });

        console.log(`[Search] sezon ${season} için bulunan bölüm: ${episodes.length}`);
        episodes.sort((a, b) => a.episode - b.episode);
        return episodes.length > 0 ? episodes : [{}];
    } catch (error) {
        console.error('[Search] detay hatası:', error.message);
        return [{}];
    }
}

module.exports = { SearchMovieAndSeries, SearchMetaMovieAndSeries, SearchDetailMovieAndSeries };
