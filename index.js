require("dotenv").config()
const MANIFEST = require('./manifest');
const landing = require("./src/landingTemplate");
const header = require('./header');
const fs = require('fs')
const Path = require("path");
const express = require("express");
const app = express();
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    next();
});
const searchVideo = require("./src/search");
const listVideo = require("./src/videos");
const path = require("path");
const NodeCache = require("node-cache");
const { v4: uuidv4 } = require('uuid');
const subsrt = require('subtitle-converter');
const Axios = require('axios')
const { setupCache } = require("axios-cache-interceptor");


const instance = Axios.create();
const axios = setupCache(instance);





const CACHE_MAX_AGE = 4 * 60 * 60; // 4 hours in seconds
const STALE_REVALIDATE_AGE = 4 * 60 * 60; // 4 hours
const STALE_ERROR_AGE = 7 * 24 * 60 * 60; // 7 days

const myCache = new NodeCache({ stdTTL: 30*60, checkperiod: 300 });

app.use(express.static(path.join(__dirname, "static")));

var respond = function (res, data) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.send(data);
};


app.get('/', function (req, res) {
        res.set('Content-Type', 'text/html');
        res.send(landing(MANIFEST));
});

app.get("/:userConf?/configure", function (req, res) {
        if (req.params.userConf !== "addon") {
            res.redirect("/addon/configure")
        } else {
            res.set('Content-Type', 'text/html');
            const newManifest = { ...MANIFEST };
            res.send(landing(newManifest));
        }
});

app.get('/manifest.json', function (req, res) {
        const newManifest = { ...MANIFEST };
        // newManifest.behaviorHints.configurationRequired = false;
        newManifest.behaviorHints.configurationRequired = false;
        return respond(res, newManifest);
});

app.get('/:userConf/manifest.json', function (req, res) {
        const newManifest = { ...MANIFEST };
        if (!((req || {}).params || {}).userConf) {
            newManifest.behaviorHints.configurationRequired = false;
           return respond(res, newManifest);
        } else {
            newManifest.behaviorHints.configurationRequired = false;
           return respond(res, newManifest);
        }
});

//CODE
app.get("/catalog/:type/:id/search=:search", async (req, res, next) => {
    try {
        var { type, id, search } = req.params;
        search = search.replace(".json", "");
        if (id == "dizipal") {
            var cached = myCache.get(search + type)
            if (cached) {
                return respond(res, { metas: cached,cacheMaxAge: CACHE_MAX_AGE, staleRevalidate: STALE_REVALIDATE_AGE, staleError: STALE_ERROR_AGE });
            }
            var metaData = [];
            var video = await searchVideo.SearchMovieAndSeries(search);

            for (const element in video) {
                if (video.hasOwnProperty(element)) {
                    const item = video[element];
                    if (typeof (item.type) === "undefined") {
                        item.type = "movie";
                    }
                    if (type === item.type) {
                        var value = {
                            id: item.url,
                            type: item.type || "movie",
                            name: item.title,
                            poster: item.poster,
                            description: "",
                            genres: []
                        }
                        item.genres.split(",").forEach((data) => {
                            value.genres.push(data.trim().toString());
                        })
                        metaData.push(value);
                    }
                }
            }
            if (metaData.length > 0) myCache.set(search + type, metaData);
            return respond(res, { metas: metaData,cacheMaxAge: CACHE_MAX_AGE, staleRevalidate: STALE_REVALIDATE_AGE, staleError: STALE_ERROR_AGE });
        }
    } catch (error) {
        console.log(error);
    }

})

app.get('/meta/:type/:id/', async (req, res, next) => {
    try {
        var { type, id } = req.params;
        id = String(id).replace(".json", "");
        var metaObj = {};
        var cached = myCache.get(id);
        if (cached) {
            return respond(res, { meta: cached,cacheMaxAge: CACHE_MAX_AGE, staleRevalidate: STALE_REVALIDATE_AGE, staleError: STALE_ERROR_AGE })
        }

        var data = await searchVideo.SearchMetaMovieAndSeries(id, type);

        if (data) {

            metaObj = {
                id: id,
                type: type,
                name: data.name,
                background: data.background,
                country: data.country || "JP",
                genres: [],
                season: Number(data.season) || undefined,
                videos: [] || undefined,
                imdbRating: Number(data.imdbRating),
                description: data.description,
                releaseInfo: String(data.releaseInfo),
                poster: data.background,
                posterShape: 'poster',
            }
            //series or movie check
            if (type === "series") {
                for (let i = 1; i <= data.season; i++) {
                    var dizipalVideo = await searchVideo.SearchDetailMovieAndSeries(id, type, i);
                    if (dizipalVideo && typeof (dizipalVideo) !== "undefined") {
                        dizipalVideo.forEach(element => {
                            if (typeof (element.title) !== "undefined") {
                                metaObj.videos.push({
                                    id: element.id,
                                    title: element.title || `Bölüm ${element.episode}`,
                                    released: "2024-01-09T00:00:00.000Z",
                                    season: i,
                                    episode: element.episode,
                                    overview: element.title || "",
                                    thumbnail: element.thumbnail
                                });
                            }

                        });
                    }
                }
                myCache.set(id, metaObj);
                return respond(res, { meta: metaObj,cacheMaxAge: CACHE_MAX_AGE, staleRevalidate: STALE_REVALIDATE_AGE, staleError: STALE_ERROR_AGE })
            } else {
                myCache.set(id, metaObj);
                return respond(res, { meta: metaObj,cacheMaxAge: CACHE_MAX_AGE, staleRevalidate: STALE_REVALIDATE_AGE, staleError: STALE_ERROR_AGE })
            }

        }
    } catch (error) {
        console.log(error);
    }


})


app.get('/stream/:type/:id/', async (req, res, next) => {
    try {
        var { type, id } = req.params;
        id = String(id).replace(".json", "");
        if (id) {
            var video = await listVideo.GetVideos(id);
            if (video) {
                const ref = video.embedUrl || '';
                const proxyUrl = `${process.env.HOSTING_URL}/hlsproxy?ref=${encodeURIComponent(ref)}&url=${encodeURIComponent(video.url)}`;
                const stream = { url: proxyUrl };
                if (video.subtitles) {
                    myCache.set(id, video.subtitles);
                }
                return respond(res, { streams: [stream],cacheMaxAge: CACHE_MAX_AGE, staleRevalidate: STALE_REVALIDATE_AGE, staleError: STALE_ERROR_AGE })
            }
        }
    } catch (error) {
        console.log(error);
    }
})

app.get('/subtitles/:type/:id/:query?.json', async (req, res, next) => {
    try {
        var { type, id } = req.params;
        id = String(id).replace(".json", "");
        var subtitles = [];
        var data = myCache.get(id)
        if (data) {
            for (const value of data) {

                if (String(value).includes("Türkçe")) {
                    var url = String(value).replace("[Türkçe]", "");
                    var newUrl = await WriteSubtitles(url, uuidv4());
                    if (newUrl) {
                        subtitles.push({ url: newUrl, lang: "tur",id:"dizipal-tur" });
                    }
                }
                if (String(value).includes("İngilizce")) {
                    var url = String(value).replace("[İngilizce]", "");
                    var newUrl = await WriteSubtitles(url, uuidv4());
                    if (newUrl) {
                        subtitles.push({ url: newUrl, lang: "eng",id:"dizipal-eng" });
                    }
                }
            }

            if (subtitles.length > 0) {
                return respond(res, { subtitles: subtitles,cacheMaxAge: CACHE_MAX_AGE, staleRevalidate: STALE_REVALIDATE_AGE, staleError: STALE_ERROR_AGE })
            }

        }
    } catch (error) {
        console.log(error);
    }
})

async function WriteSubtitles(url, name) {
    try {
        var response = await axios({ url: url, method: "GET", headers: header });
        if (response && response.status === 200) {
            CheckSubtitleFoldersAndFiles();
            const outputExtension = '.srt';
            const options = {
                removeTextFormatting: true,
            };

            var subtitle = subsrt.convert(response.data, outputExtension, options).subtitle;

            fs.writeFileSync(path.join(__dirname, "static", "subs", name + ".srt"), subtitle);
            var url = `${process.env.HOSTING_URL}/subs/${name}.srt`;
            return url;
        }
    } catch (error) {
        console.log(error);
    }
}


function CheckSubtitleFoldersAndFiles() {
    try {
        const folderPath = path.join(__dirname, "static", "subs");

        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath);
        }

        const files = fs.readdirSync(folderPath);

        if (files.length > 500) {
            files.forEach((file) => {
                const filePath = Path.join(folderPath, file);
                const fileStats = fs.statSync(filePath);

                if (fileStats.isFile()) {
                    fs.unlinkSync(filePath);
                } else if (fileStats.isDirectory()) {
                    // Dizin içinde dosya varsa onları da silmek için
                    fs.rmdirSync(filePath, { recursive: true });
                }
            });
        }
    } catch (error) {
        console.log(error);
    }

}


app.get('/hlsproxy', async (req, res) => {
    const url = req.query.url;
    const ref = req.query.ref || '';
    if (!url) return res.status(400).send('No URL');

    try {
        const proxyHeaders = {
            'User-Agent': header['User-Agent'],
            'Referer': ref,
            'Origin': ref ? new URL(ref).origin : '',
        };

        const upstream = await Axios.create()({
            url,
            method: 'GET',
            headers: proxyHeaders,
            responseType: 'arraybuffer',
            timeout: 15000,
        });

        const isM3u8 = url.includes('.m3u8') || (upstream.headers['content-type'] || '').includes('mpegurl');

        res.setHeader('Access-Control-Allow-Origin', '*');

        if (isM3u8) {
            const text = upstream.data.toString('utf8');
            const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
            const proxyBase = `${process.env.HOSTING_URL}/hlsproxy?ref=${encodeURIComponent(ref)}&url=`;

            const rewritten = text.split('\n').map(line => {
                const trimmed = line.trim();
                if (trimmed === '' || trimmed.startsWith('#')) return line;
                const absUrl = trimmed.startsWith('http') ? trimmed : baseUrl + trimmed;
                return proxyBase + encodeURIComponent(absUrl);
            }).join('\n');

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            return res.send(rewritten);
        }

        res.setHeader('Content-Type', upstream.headers['content-type'] || 'video/mp2t');
        return res.send(upstream.data);
    } catch (e) {
        console.log('[HLSProxy] hata:', e.message, 'url:', url.slice(0, 60));
        res.status(502).send('Proxy error');
    }
});

if (module.parent) {
    module.exports = app;
} else {
    const port = process.env.PORT || 7005;
    app.listen(port, function () {
        console.log(`extension running port : ${port}`);
    });
}

//publishToCentral(process.env.HOSTING_URL+"/manifest.json")