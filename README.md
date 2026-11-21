# Number Merge

Game puzzle angka **Drop & Merge** untuk penggunaan pribadi. Berbentuk Progressive Web App (PWA): bisa di-install dari Chrome Android dan dimainkan offline.

- 5 kolom × 7 baris, multi-block merge (`N` balok bernilai `V` → `V × 2^(N-1)`), chain merge otomatis
- **Menang** saat berhasil membuat balok **16K (16384) atau lebih**. Setelah itu permainan selesai.
- Angka sampai 8192 ditulis lengkap. Di atasnya pakai singkatan: 16K, 32K, … 512K, 1M, …
- Bom tanpa batas, auto save, continue game
- Musik latar + efek suara. Tombol SUARA berputar: Semua ON → Musik OFF → Semua OFF
- Tanpa skor, tanpa login, tanpa backend, tanpa dependency, dan **tanpa proses build**

## Menjalankan secara lokal

Project ini berupa file statis biasa (HTML + CSS + JavaScript ES modules), jadi cukup disajikan oleh web server apa saja:

| Cara | Perintah | URL |
|---|---|---|
| XAMPP (Apache aktif) | – | http://localhost/number/ |
| Server bawaan PHP | `C:\xampp7\php\php.exe -S 127.0.0.1:8765 -t .` | http://127.0.0.1:8765/ |
| Python | `python -m http.server 8765` | http://127.0.0.1:8765/ |

> Jangan membuka `index.html` langsung lewat `file://`, karena ES modules dan service worker membutuhkan HTTP.
> Service worker hanya aktif di `localhost` atau HTTPS. Untuk install di HP, gunakan hosting HTTPS (lihat di bawah).

## Kontrol

- **Ketuk kolom**: jatuhkan balok "Sekarang"
- **BOM**: masuk mode bom, lalu ketuk satu balok untuk menghancurkannya. Ketuk BOM lagi (BATAL) untuk membatalkan.
- **NEW GAME**: mulai ulang (dengan konfirmasi)
- **SUARA**: ketuk untuk berganti mode: Semua ON → Musik OFF → Semua OFF
- Keyboard (desktop): `1`–`5` drop, `B` bom, `Esc` batal

## Testing

Jalankan server lokal, lalu buka di browser:

- `tests/index.html`: 52 unit test (engine, connected components, gravitasi, rumus merge, chain, bom, game over, menang 16K, label angka, generator, save/load, siklus suara/musik, fuzz 3000 langkah acak)
- `tests/ui.html`: 44 test end-to-end di aplikasi asli (input sentuh, double tap, bom, game over, layar menang, new game, auto save, continue, siklus tombol suara, file musik, layout, cache offline)

Judul tab menampilkan `PASS x/y` atau `FAIL x/y`.

Headless (Chrome):

```bash
chrome --headless=new --virtual-time-budget=120000 --dump-dom http://127.0.0.1:8765/tests/ui.html
```

## Deploy ke GitHub Pages

1. Buat repository baru di GitHub, lalu push seluruh isi folder ini (root repo = folder ini):
   ```bash
   git init
   git add .
   git commit -m "Number Merge"
   git branch -M main
   git remote add origin https://github.com/<username>/<repo>.git
   git push -u origin main
   ```
2. Buka **Settings → Pages**, lalu pilih **Deploy from a branch**, branch `main`, folder `/ (root)`, dan simpan.
3. Setelah beberapa menit, game tersedia di `https://<username>.github.io/<repo>/`.
4. Buka URL tersebut di **Chrome Android**, lalu pilih menu ⋮ → **Install app** / **Tambahkan ke layar utama**.

Semua path di project bersifat relatif, jadi game berjalan di sub-folder (`/<repo>/`) tanpa perlu diubah. File `.nojekyll` mencegah GitHub memproses ulang file.

Hosting statis lain (Netlify, Cloudflare Pages, Vercel) juga bisa: cukup upload folder ini apa adanya, tanpa build command.

### Saat meng-update game

Naikkan `CACHE_VERSION` di `sw.js` (misalnya `'v1'` → `'v2'`) setiap kali ada file yang diubah. Tanpa itu, HP yang sudah meng-install akan tetap memakai versi lama dari cache. Versi baru aktif setelah aplikasi ditutup lalu dibuka kembali.

## Struktur

```
index.html              Layout aplikasi
manifest.webmanifest    Konfigurasi PWA
sw.js                   Service worker (precache, offline)
css/style.css           Tema gelap, animasi, responsif
js/main.js              Entry: input, alur animasi, dialog
js/engine/              Logika murni (tanpa DOM)
  config.js             Ukuran papan (COLS/ROWS)
  board.js              Gravitasi, flood fill (BFS), rumus merge, resolve chain
  game.js               Proses DROP dan BOM, deteksi game over
  generator.js          Generator angka berbobot (SPAWN_CONFIG)
js/core/                State & penyimpanan
  controller.js         Satu sumber state: game, mode bom, lock animasi, pengaturan
  persistence.js        Serialisasi + validasi save
  storage.js            Adapter LocalStorage (aman dari error)
js/ui/                  Tampilan
  renderer.js           Render balok & animasi (drop, merge, chain, gravitasi, ledakan)
  tiles.js              Warna & label per angka
  audio.js              Efek suara sintetis + pemutar musik loop (Web Audio)
audio/music.ogg         Musik latar (CC BY 4.0, lihat Kredit musik)
icons/                  Ikon aplikasi (SVG + PNG 192/512/maskable)
tools/generate-icons.ps1  Generator ikon PNG
tests/                  Unit test & UI test
```

## Kredit musik

**“Winter Village [Loop]”** oleh **Visager**, dari album *Songs From An Unmade World 2*.
Lisensi: [Creative Commons Attribution 4.0 (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
Sumber: [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Visager_-_25_-_Winter_Village_Loop.ogg) / [Free Music Archive](https://freemusicarchive.org/music/Visager/).
File disimpan sebagai `audio/music.ogg` tanpa diubah. Kredit juga ditampilkan di dialog New Game, Game Over, dan Menang.

## Menyesuaikan

- **Nilai kemenangan**: `WIN_VALUE` di `js/engine/config.js` (default 16384)
- **Musik**: ganti `audio/music.ogg` (format OGG/MP3; jika nama file berubah, ubah juga di `js/main.js` dan `sw.js`). Volume diatur lewat `volume` di `MusicPlayer` (`js/ui/audio.js`).

- **Probabilitas angka**: `SPAWN_CONFIG` di `js/engine/generator.js` (bobot pembuka, bobot normal, batas angka maksimum yang muncul relatif terhadap balok tertinggi)
- **Ukuran papan**: `COLS` / `ROWS` di `js/engine/config.js` (save lama otomatis diabaikan bila ukurannya berbeda)
- **Warna balok**: `PALETTE` di `js/ui/tiles.js`
- **Suara/musik default**: `DEFAULT_SETTINGS` di `js/core/controller.js`
