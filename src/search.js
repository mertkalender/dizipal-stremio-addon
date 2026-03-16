require("dotenv").config();
const header = require("../header");
const sslfix = require("./sslfix");
const cheerio = require("cheerio");
const Axios = require('axios');

const axios = Axios.create();

// HTML'deki tam URL'den sadece path'i çıkar
function extractPath(href) {
    try {
        return new URL(href).pathname;
    } catch {
        return href.replace(/https?:\/\/[^/]+/, '');
    }
}

// URL'den içerik tipini belirle
function getTypeFromUrl(url) {
    if (url.includes('/dizi/') || url.includes('/anime/')) return 'series';
    return 'movie';
}

// Arama - keremiya_live_search AJAX endpoint kullanır
async function SearchMovieAndSeries(name) {
    try {
        let nonce = process.env.SEARCH_NONCE;
        if (!nonce) {
            console.warn('[Search] SEARCH_NONCE henüz yok, bekleniyor...');
            for (let i = 0; i < 30; i++) {
                await new Promise(r => setTimeout(r, 1000));
                nonce = process.env.SEARCH_NONCE;
                if (nonce) break;
            }
            if (!nonce) {
                console.warn('[Search] SEARCH_NONCE 30sn içinde gelmedi, boş dönülüyor.');
                return {};
            }
        }

        const searchUrl = `${process.env.PROXY_URL}/wp-admin/admin-ajax.php`;
        const postData = `action=keremiya_live_search&nonce=${nonce}&query=${encodeURIComponent(name)}`;
        console.log('[Search] POST yapılıyor:', searchUrl);
        const response = await axios({
            ...sslfix,
            url: searchUrl,
            method: 'POST',
            headers: {
                ...header,
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
            },
            data: postData,
        });
        console.log('[Search] yanıt uzunluk:', response.data?.length, 'ilk 200:', response.data?.substring(0, 200));
        if (!response.data) return {};

        const $ = cheerio.load(response.data);
        const results = {};

        $('div.flex.items-start').each((i, container) => {
            if ($(container).hasClass('search-link-text')) return;

            const posterLink = $(container).find('a').first();
            const href = posterLink.attr('href') || $(container).find('h4 a').attr('href') || '';
            if (!href || href.includes('/?s=')) return;

            const title = $(container).find('h4 a').text().trim();
            if (!title) return;

            const poster = posterLink.find('img').attr('src') || '';
            const type = getTypeFromUrl(href);
            const urlPath = extractPath(href);

            results[urlPath] = {
                url: urlPath,
                title,
                poster,
                type,
                genres: '',
            };
        });

        return results;
    } catch (error) {
        console.error('[Search] SearchMovieAndSeries hatası:', error.message);
        return {};
    }
}

// Dizi/film meta bilgisi
async function SearchMetaMovieAndSeries(id, type) {
    try {
        const response = await axios({
            ...sslfix,
            url: process.env.PROXY_URL + id,
            headers: header,
            method: 'GET',
        });

        if (!response || response.status !== 200) return null;

        const $ = cheerio.load(response.data);

        const name = $('meta[property="og:title"]').attr('content')?.replace(/\s*[-|]\s*Dizipal.*$/i, '').trim()
            || $('title').text().replace(/\s*[-|]\s*Dizipal.*$/i, '').trim();

        const background = $('meta[property="og:image"]').attr('content') || '';
        const description = $('meta[property="og:description"]').attr('content') || '';

        let maxSeason = 1;
        $('a[href*="?sezon="]').each((i, el) => {
            const href = $(el).attr('href') || '';
            const match = href.match(/\?sezon=(\d+)/);
            if (match) maxSeason = Math.max(maxSeason, parseInt(match[1]));
        });

        const html = response.data;
        const yearMatch = html.match(/(20\d\d)/);
        const releaseInfo = yearMatch ? yearMatch[1] : '';

        const isYerli = $('a[href*="/kategori/yerli"]').length > 0
            || html.toLowerCase().includes('yerli');
        const country = isYerli ? 'TR' : 'US';

        const genres = [];
        $('a[href*="/kategori/"]').each((i, el) => {
            const g = $(el).text().trim();
            if (g) genres.push(g);
        });

        return { name, background, country, genres, season: maxSeason, imdbRating: 0, description, releaseInfo };
    } catch (error) {
        console.error('[Search] SearchMetaMovieAndSeries hatası:', error.message);
        return null;
    }
}

// Dizi bölüm listesi
async function SearchDetailMovieAndSeries(id, type, season) {
    try {
        if (type !== 'series') {
            return [{ id }];
        }

        const url = `${process.env.PROXY_URL}${id}${id.includes('?') ? '&' : '?'}sezon=${season}`;
        const response = await axios({
            ...sslfix,
            url,
            headers: header,
            method: 'GET',
        });

        if (!response || response.status !== 200) return [{}];

        const $ = cheerio.load(response.data);
        const episodes = [];
        const seen = new Set();

        $('a[href*="/bolum/"]').each((i, el) => {
            const href = $(el).attr('href') || '';
            if (!href.includes('/bolum/')) return;

            const slugMatch = href.match(/(\d+)-sezon-(\d+)-bolum/);
            if (!slugMatch) return;

            const epSeason = parseInt(slugMatch[1]);
            const epNum = parseInt(slugMatch[2]);
            if (epSeason !== season) return;

            const epPath = extractPath(href);
            if (seen.has(epPath)) return;
            seen.add(epPath);

            let thumbnail = '';
            $(el).find('img[src*="uploads"]').each((j, img) => {
                if (!thumbnail) thumbnail = $(img).attr('src') || '';
            });

            episodes.push({
                id: epPath,
                title: `${season}. Sezon ${epNum}. Bölüm`,
                thumbnail,
                episode: epNum,
            });
        });

        episodes.sort((a, b) => a.episode - b.episode);
        return episodes.length > 0 ? episodes : [{}];
    } catch (error) {
        console.error('[Search] SearchDetailMovieAndSeries hatası:', error.message);
        return [{}];
    }
}

module.exports = { SearchMovieAndSeries, SearchMetaMovieAndSeries, SearchDetailMovieAndSeries };
