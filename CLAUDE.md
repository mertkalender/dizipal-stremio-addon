# Dizipal Stremio Addon

Node.js/Express tabanlı Stremio addon. Dizipal sitesinden içerik çekip Stremio'ya sunar.

## Çalıştırma

```bash
node index.js        # varsayılan port 7005
```

`.env` dosyası gereklidir (`.env.example` yoktur, elle oluştur):
```
PROXY_URL=https://dizipalXXXX.com
HOSTING_URL=https://senin-sunucun.com
PORT=7005
URLGETSTATUS=false
```

## Git

Commit ve push — her zaman ikisini birden yap:
```bash
git add <dosyalar>
git commit --no-gpg-sign -m "mesaj"
git push
```

## Proje Yapısı

```
index.js          - Express sunucu, tüm Stremio route'ları
manifest.js       - Addon manifest tanımı
header.js         - Tüm HTTP istekleri için sabit User-Agent/Accept-Language
src/
  search.js       - Arama, meta ve bölüm listesi çekme
  videos.js       - Video URL çözme (AES decrypt)
  urlManager.js   - Çalışan dizipal domain'ini otomatik tespit
  sslfix.js       - SSL sertifika bypass ayarları
  landingTemplate.js - Addon anasayfa HTML şablonu
  getUrlApi.js    - GitHub'dan URL çekme (URLGETSTATUS=true olduğunda, güvenilmez)
```

## Stremio Akışı

1. **Catalog** → `GET /catalog/:type/dizipal/search=:query` → `SearchMovieAndSeries()`
2. **Meta** → `GET /meta/:type/:id` → `SearchMetaMovieAndSeries()` + `SearchDetailMovieAndSeries()`
3. **Stream** → `GET /stream/:type/:id` → `GetVideos()` → HLS proxy URL döner
4. **Subtitles** → `GET /subtitles/:type/:id` → cache'den altyazı, SRT'ye çevirir
5. **HLS Proxy** → `GET /hlsproxy` → m3u8/ts segmentleri Referer ile proxy'ler

## Site Yapısı (Güncel — dizipal1543+ platformu)

Site özel bir platform (WordPress değil). Cloudflare koruması var, DevTools engelliyor.

### URL Formatları
- Dizi/anime: `/series/{slug}`
- Bölüm: `/bolum/{slug}-{sezon}x{bolum}-{code}` (örn: `/bolum/prens-3x2-c04`)
- Arama: `/arama?q={query}`

### Arama (search.js)
- `GET /arama?q=...` ile HTML döner
- `article.content-card` → `a.card-link` (href), `h3.card-title` (başlık), `img[data-src]` (poster)
- URL'den tür tespiti: `/dizi/` veya `/anime/` → `series`, diğer → `movie`

### Meta (search.js)
- Dizi sayfasını GET ile çek
- `meta[property="og:title"]` → isim
- `select[onchange="changeSsEpisode(this)"] option` → sezon sayısı
- `a[href*="/kategori/"]` → türler

### Bölüm Listesi (search.js)
- Dizi sayfasını GET ile çek
- Sezon N için selector: `ul.epsf{N} .ep-item a[href*="/bolum/"]`
- URL'den bölüm parse: `/(\d+)x(\d+)-/` → group(1)=sezon, group(2)=bölüm

### Video Çözme (videos.js) — KRİTİK

Site video URL'ini istemci tarafında AES ile şifreli tutar. Hiçbir AJAX endpoint yok.

**Adımlar:**

1. Bölüm sayfasını GET ile çek
2. `window.appCKey = '...'` değerini script tag'inden regex ile al (base64 string, şifre olarak kullanılır)
3. `<div data-rm-k="true">` içindeki JSON'u al: `{ ciphertext, iv, salt }`
4. Node.js built-in `crypto` ile decrypt et:

```js
const key = crypto.pbkdf2Sync(appCKey, Buffer.from(salt, 'hex'), 1015, 32, 'sha512');
const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(iv, 'hex'));
const embedUrl = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
```

Bu mantık `app-dizipals.js`'ten reverse-engineer edildi (`oyunculistdc` fonksiyonu: PBKDF2 SHA-512, keySize=64/8=8 words=32 bytes, iterations=1015).

5. Çıkan embed URL'i `scrapeEmbedUrl()` ile çek → `file: "...m3u8..."` regex ile stream URL'ini al
6. `GetVideos()` `{ url, embedUrl }` döner
7. `index.js` bunu HLS proxy URL'e çevirir: `/hlsproxy/stream.m3u8?ref=...&url=...`

### HLS Proxy (index.js)
- m3u8 dosyasını indir, segment URL'lerini kendi proxy URL'lerine çevir (Referer eklemek için)
- TS segmentleri `video/mp2t` content-type ile pipe'la

## URL Yönetimi (urlManager.js)

Site domain'i sürekli değişir (dizipal1543, dizipal2034 vs.).

- `.env`'deki `PROXY_URL`'i baz alır
- 20 dakikada bir `dizipalN+1`, `dizipalN+2`, ... `dizipalN+10` dener
- 200 dönen ilk URL'i kullanır
- `URLGETSTATUS=false` tutulmalı (GitHub JSON güvenilmez)

**Domain değişince:** `.env`'deki `PROXY_URL`'i güncelle yeterli.

## Bağımlılıklar

```json
axios, axios-cache-interceptor  - HTTP istekleri (cache'li)
cheerio                         - HTML parse
express                         - Sunucu
node-cache                      - Bellek cache (30 dk TTL)
subtitle-converter              - Altyazı formatı dönüştürme
uuid                            - Altyazı dosya adları
dotenv                          - .env okuma
puppeteer, puppeteer-extra*     - Kurulu ama artık kullanılmıyor
```

## Dikkat Edilecekler

- `appCKey` sayfa başlığında script tag'inde bulunur, bölümden bölüme değişebilir — her `GetVideos()` çağrısında sayfadan taze okunur
- Site DevTools'u aktif olarak engeller (`disable-devtool` CDN scripti), `view-source:` kullan
- Tüm HTTP isteklerinde `header.js`'teki User-Agent ve Accept-Language gönderilmeli
- `sslfix.js` SSL hatalarını bypass eder — production'da gerekli
- Cache TTL 30 dakika; video URL'leri ve meta ayrı cache key'leri kullanır
