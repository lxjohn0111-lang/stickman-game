# One Way Out – CrazyGames feltöltés

Ebben a mappában minden megvan, amit a CrazyGames fejlesztői portálra (developer.crazygames.com) fel kell tölteni. Nincs benne zip, minden sima fájl.

| Mit | Hova a portálon |
| --- | --- |
| `game/` mappa tartalma: `index.html` + `game.js` | A játékfájlok feltöltése (HTML5). Az `index.html` legyen a gyökérben, a `game.js` mellette. Kb. 1,1 MB, 2 fájl. |
| `game-onefile/index.html` | **Tartalék**, csak akkor, ha a kétfájlos feltöltés után a portálon a "The game could not be loaded" hibát látod: ez ugyanaz a játék egyetlen fájlban, a `game.js` bele van fordítva. Egy fájl, kb. 1,1 MB, nincs mellette semmi, amit a portál elveszíthet. |
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

A játék a Pokira is fel van téve, az a build a `poki upload/` mappában van. A két portál SDK-ja teljesen külön kódban van (`src/platforms/crazygames.js` és `src/platforms/poki.js`), és mindegyik build csak a saját SDK-ját tölti be, így az egyiken végzett változtatás a másikat nem érinti.

## Mit csinál a CrazyGames SDK a játékban

A `game/index.html` a `<head>`-ben betölti a CrazyGames HTML5 SDK v3-at (`https://sdk.crazygames.com/crazygames-sdk-v3.js`). A játék:

- indításkor `await CrazyGames.SDK.init()`-et hív, és csak utána olvassa be a mentést;
- a **haladást** (feloldott pályák, rekordok, csillagok, titkok, eredmények, Endless rekord) és a **beállításokat** a **data modulon** keresztül menti (`SDK.data.getItem` / `setItem`), így bejelentkezett játékosnál a CrazyGames-fiókba kerül, és minden eszközön megvan; vendégnél a CrazyGames a böngészőben tárolja;
- betöltéskor `loadingStart` / `loadingStop`, játék közben `gameplayStart`, szünetnél, halálnál, menüben és pálya végén `gameplayStop` hívást küld;
- pálya teljesítésekor `happytime()`-ot hív;
- figyeli a portál **némítás** (`muteAudio`) beállítását, és ha be van kapcsolva, elhallgat;
- a CrazyGames-en elrejti a saját teljes képernyő gombját (a portálnak saját gombja van), a jobb klikk menüt és a szövegkijelölést letiltja.

Ha az SDK nem érhető el (például reklámblokkoló miatt), a játék 5 másodperc után nélküle indul, és a böngésző localStorage-ába ment.

Reklámot (midgame / rewarded) a CrazyGames-en a játék **nem** kér. Ha kellene, a `src/platforms/crazygames.js`-ben az `adBreak()` helyére kerülne az `SDK.ad.requestAd` hívás, és az `ads: true` kapcsolóval a játék magától kérne egy reklámot minden pályakezdés előtt (a Pokin ez már így működik).

## Ha a portál azt írja, hogy "The game could not be loaded"

Ez az üzenet akkor jelenik meg, ha a `game.js` nem fut le. Két oka lehet:

1. **A portál nem szolgálja ki a `game.js`-t** (nem a gyökérbe került, vagy kimaradt a feltöltésből). Ilyenkor töltsd fel helyette a `game-onefile/index.html`-t egymagában: abban a játék kódja benne van, így nincs második fájl, ami elveszhet.
2. **Csak lassú volt a letöltés.** Ezt a játék korábban hibának vette: 8 másodperc után kiírta az üzenetet, pedig a játék utána rendben elindult. Ez javítva van: a figyelő most 45 másodpercig vár, a tényleg hiányzó fájlt megnevezi, a lassút pedig békén hagyja, és amint a kód lefut, az üzenet eltűnik.

## Tesztelés feltöltés előtt

A portál "Preview" / QA eszközében ellenőrizd, hogy a menü betöltődik, egy pálya elindul, és újratöltés után megmarad a haladás. Helyben:

```sh
npm run build          # újragenerálja a game/ mappát a src/-ből
node tests/sdk-crazygames.mjs   # SDK-integráció egy SDK-utánzattal
node tests/mobile.mjs  # érintéses irányítás telefon-emulációban
node tests/boot.mjs    # a betöltésfigyelő, és hogy az egyfájlos build magában is elindul
```

A borítók és videók újragenerálása: `node tools/covers.mjs`, `node tools/video.mjs landscape`, `node tools/video.mjs portrait`.
