require("dotenv").config();
const header = require("../header");
const sslfix = require("./sslfix");
const cheerio = require("cheerio");
const Axios = require('axios');

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
        const searchUrl = `${process.env.PROXY_URL}/arama?q=${encodeURIComponent(name)}`;
        console.log('[Search] GET:', searchUrl);
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

        console.log('[Search] sonuç sayısı:', Object.keys(results).length);
        return results;
    } catch (error) {
        console.error('[Search] hatası:', error.message);
        return {};
    }
}

async function SearchMetaMovieAndSeries(id, type) {
    try {
        const response = await axios({ ...sslfix, url: process.env.PROXY_URL + id, headers: header, method: 'GET' });
        if (!response || response.status !== 200) return null;

        const $ = cheerio.load(response.data);

        const name = $('meta[property="og:title"]').attr('content')?.replace(/\s*[-|]\s*Dizipal.*$/i, '').trim()
            || $('title').text().replace(/\s*[-|]\s*Dizipal.*$/i, '').trim();

        const background = $('meta[property="og:image"]').attr('content') || '';
        const description = $('meta[property="og:description"]').attr('content') || '';

        let maxSeason = 1;
        $('a[href*="?sezon="], a[href*="/sezon/"]').each((i, el) => {
            const href = $(el).attr('href') || '';
            const match = href.match(/sezon[=/](\d+)/);
            if (match) maxSeason = Math.max(maxSeason, parseInt(match[1]));
        });

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

        const url = `${process.env.PROXY_URL}${id}${id.includes('?') ? '&' : '?'}sezon=${season}`;
        const response = await axios({ ...sslfix, url, headers: header, method: 'GET' });
        if (!response || response.status !== 200) return [{}];

        const $ = cheerio.load(response.data);
        const episodes = [];
        const seen = new Set();

        $('a[href*="/bolum/"], a[href*="/sezon/"]').each((i, el) => {
            const href = $(el).attr('href') || '';

            const slugMatch = href.match(/(\d+)[.-]sezon[.-](\d+)[.-]bolum/)
                || href.match(/sezon\/(\d+)\/bolum\/(\d+)/);
            if (!slugMatch) return;

            const epSeason = parseInt(slugMatch[1]);
            const epNum = parseInt(slugMatch[2]);
            if (epSeason !== season) return;

            const epPath = extractPath(href);
            if (seen.has(epPath)) return;
            seen.add(epPath);

            let thumbnail = '';
            $(el).find('img').each((j, img) => {
                if (!thumbnail) thumbnail = $(img).attr('data-src') || $(img).attr('src') || '';
            });

            episodes.push({ id: epPath, title: `${season}. Sezon ${epNum}. Bölüm`, thumbnail, episode: epNum });
        });

        episodes.sort((a, b) => a.episode - b.episode);
        return episodes.length > 0 ? episodes : [{}];
    } catch (error) {
        console.error('[Search] detay hatası:', error.message);
        return [{}];
    }
}

module.exports = { SearchMovieAndSeries, SearchMetaMovieAndSeries, SearchDetailMovieAndSeries };
