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

## Site Yapısı (Güncel — dizipal2035+ platformu)

Site özel bir platform (WordPress değil). Cloudflare koruması var, DevTools engelliyor.

**ÖNEMLİ:** Dizipal iki farklı platform nesli kullanıyor:
- **Eski platform** (ör. dizipal2034 ve altı): WordPress tabanlı, `appCKey` yok, farklı player. Çalışmaz.
- **Yeni platform** (ör. dizipal2035+): `window.appCKey` içerir, AES şifreli player. Çalışır.

`urlManager` sadece `appCKey` içeren sayfaları geçerli sayar — bu sayede eski platformu otomatik atlar.

### URL Formatları

Bölüm URL'i **iki farklı formatta** olabilir, ikisi de desteklenir:
- Yeni format: `/bolum/{slug}-{N}x{M}-{code}` (örn: `/bolum/prens-3x2-c04`)
- Eski format: `/bolum/{slug}-{N}-sezon-{M}-bolum` (örn: `/bolum/gibi-1-sezon-1-bolum`)

Diğerleri:
- Dizi/anime sayfası: `/dizi/{slug}` veya `/series/{slug}`
- Arama: `/arama?q={query}`

### Arama (search.js)
- `GET /arama?q=...` ile HTML döner
- `article.content-card` → `a.card-link` (href), `h3.card-title` (başlık), `img[data-src]` (poster)
- URL'den tür tespiti: `/dizi/` veya `/anime/` → `series`, diğer → `movie`

### Meta (search.js)
- Dizi sayfasını GET ile çek
- `meta[property="og:title"]` → isim
- **Sezon sayısı:** `a[href*="/bolum/"]` linklerini tara, URL'den regex ile max sezon bul
  - Yeni format: `/(\d+)x\d+/`
  - Eski format: `/-(\d+)-sezon-\d+-bolum/`
- `a[href*="/kategori/"]` → türler

### Bölüm Listesi (search.js)
- Dizi sayfasını GET ile çek
- `a[href*="/bolum/"]` tüm linkleri bul (NOT: `ul.epsf{N}` selector'ü kullanma — `ul` içinde `div` olan geçersiz HTML yapısı cheerio'da bozuluyor)
- URL'den sezon ve bölüm parse et, her iki format için:
  ```js
  let m = href.match(/(\d+)x(\d+)-/) || href.match(/-(\d+)-sezon-(\d+)-bolum/);
  // m[1] = sezon, m[2] = bölüm
  ```
- `parseInt(m[1]) !== season` olanları filtrele

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

Site domain'i sürekli değişir (dizipal2035, dizipal2036 vs.).

- `.env`'deki `PROXY_URL`'i baz alır
- 20 dakikada bir `dizipalN`, `dizipalN+1`, ... `dizipalN+10` dener
- **Sadece `appCKey` içeren** sayfaları geçerli sayar (eski platform false positive'lerini engeller)
- `URLGETSTATUS=false` tutulmalı (GitHub JSON güvenilmez)

**Domain değişince:** `.env`'deki `PROXY_URL`'i en son çalışan domain'e güncelle, container restart.

```bash
# Sunucuda .env düzenle:
nano /path/to/.env
# PROXY_URL=https://dizipal2035.com  ← güncel numarayı yaz
docker restart dizipal-addon
```

## Bağımlılıklar

```
axios, axios-cache-interceptor  - HTTP istekleri (cache'li)
cheerio                         - HTML parse
express                         - Sunucu
node-cache                      - Bellek cache (30 dk TTL)
subtitle-converter              - Altyazı formatı dönüştürme
uuid                            - Altyazı dosya adları
dotenv                          - .env okuma
puppeteer, puppeteer-extra      - Kurulu ama artık kullanılmıyor
```

## Dikkat Edilecekler

- `appCKey` her sayfada farklı olabilir — her `GetVideos()` çağrısında sayfadan taze okunur
- Site DevTools'u aktif olarak engeller (`disable-devtool` CDN scripti), `view-source:` kullan
- Tüm HTTP isteklerinde `header.js`'teki User-Agent ve Accept-Language gönderilmeli
- `sslfix.js` SSL hatalarını bypass eder — production'da gerekli
- Cache TTL 30 dakika; video URL'leri ve meta ayrı cache key'leri kullanır
- İç linkler bazen farklı domain numarası gösterebilir (ör. 2035 dönerken 2036 linkleri) — `extractPath` ile pathname al, `proxyUrl` ile birleştir
