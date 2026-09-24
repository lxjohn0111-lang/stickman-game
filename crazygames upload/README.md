# One Way Out – CrazyGames feltöltés

Ebben a mappában minden megvan, amit a CrazyGames fejlesztői portálra (developer.crazygames.com) fel kell tölteni. Nincs benne zip, minden sima fájl.

| Mit | Hova a portálon |
| --- | --- |
| `game/` mappa tartalma: `index.html` + `game.js` | A játékfájlok feltöltése (HTML5). Az `index.html` legyen a gyökérben, a `game.js` mellette. Kb. 1,1 MB, 2 fájl. |
| `covers/cover-landscape-1920x1080.png` | Borítókép, fekvő 16:9 |
| `covers/cover-portrait-800x1200.png` | Borítókép, álló 2:3 |
| `covers/cover-square-800x800.png` | Borítókép, négyzetes 1:1 |
| `video/one-way-out-landscape-1920x1080.mp4` | Előnézeti videó, fekvő (18 mp, néma) |
| `video/one-way-out-portrait-1080x1620.mp4` | Előnézeti videó, álló (18 mp, néma) |
| `description.txt` | Rövid leírás és hosszú leírás (angol) |
| `controls.txt` | Irányítás (billentyűzet + egér, érintés) |

## Adatlap-javaslatok

- **Cím:** One Way Out
- **Kategória:** Shooting (címkék: FPS, stickman, 3D, first person shooter, campaign)
- **Tájolás mobilon:** fekvő (landscape). Álló helyzetben a játék kéri, hogy fordítsd el a telefont.
- **Mobil és tablet:** támogatott (érintéses irányítás, célzássegítés)
- **Nyelv:** angol

## Mit csinál a CrazyGames SDK a játékban

A `game/index.html` a `<head>`-ben betölti a CrazyGames HTML5 SDK v3-at (`https://sdk.crazygames.com/crazygames-sdk-v3.js`). A játék:

- indításkor `await CrazyGames.SDK.init()`-et hív, és csak utána olvassa be a mentést;
- a **haladást** (feloldott pályák, rekordok, csillagok, titkok, eredmények, Endless rekord) és a **beállításokat** a **data modulon** keresztül menti (`SDK.data.getItem` / `setItem`), így bejelentkezett játékosnál a CrazyGames-fiókba kerül, és minden eszközön megvan; vendégnél a CrazyGames a böngészőben tárolja;
- betöltéskor `loadingStart` / `loadingStop`, játék közben `gameplayStart`, szünetnél, halálnál, menüben és pálya végén `gameplayStop` hívást küld;
- pálya teljesítésekor `happytime()`-ot hív;
- figyeli a portál **némítás** (`muteAudio`) beállítását, és ha be van kapcsolva, elhallgat;
- a CrazyGames-en elrejti a saját teljes képernyő gombját (a portálnak saját gombja van), a jobb klikk menüt és a szövegkijelölést letiltja.

Ha az SDK nem érhető el (például reklámblokkoló miatt), a játék 5 másodperc után nélküle indul, és a böngésző localStorage-ába ment.

Reklámot (midgame / rewarded) a játék nem kér. Ha kellene, a pályák közötti váltás jó hely lenne rá.

## Tesztelés feltöltés előtt

A portál "Preview" / QA eszközében ellenőrizd, hogy a menü betöltődik, egy pálya elindul, és újratöltés után megmarad a haladás. Helyben:

```sh
npm run build          # újragenerálja a game/ mappát a src/-ből
node tests/sdk.mjs     # SDK-integráció egy SDK-utánzattal
node tests/mobile.mjs  # érintéses irányítás telefon-emulációban
```

A borítók és videók újragenerálása: `node tools/covers.mjs`, `node tools/video.mjs landscape`, `node tools/video.mjs portrait`.
