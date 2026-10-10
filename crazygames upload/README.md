# One Way Out – CrazyGames feltöltés

Ebben a mappában minden megvan, amit a CrazyGames fejlesztői portálra (developer.crazygames.com) fel kell tölteni. Nincs benne zip, minden sima fájl.

| Mit | Hova a portálon |
| --- | --- |
| **`one-way-out-crazygames.zip`** (a repó gyökerében) | **Ezt töltsd fel.** Kész zip, amiben az `index.html` a gyökérben van, burkoló mappa nélkül — pont ahogy a CrazyGames kéri. 309 KB. |
| `one-way-out-crazygames-onefile.zip` | **Tartalék**, ha az előző után is a "The game could not be loaded" hibát látod: ugyanaz a játék egyetlen `index.html`-ben, a `game.js` bele van fordítva. Nincs benne második fájl, amit a portál elveszíthet. |
| `game/` mappa tartalma: `index.html` + `game.js` | Ugyanaz kibontva, ha inkább fájlonként töltöd fel. **Az `index.html`-nek a gyökérben kell lennie, a `game.js` mellette** — ne a `game` mappát zippeld be, mert akkor az `index.html` egy szinttel lejjebb kerül, és a portál nem találja meg. |
| `game-onefile/index.html` | A tartalék kibontva, egy fájl. |
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
- **Reklám:** a játék kér midgame reklámot, szóval a fejlesztői portálon a reklámot engedni kell (ha a portál külön kérdezi, hogy van-e a játékban reklám, a válasz igen). Ha nem akarsz reklámot, lásd a reklámos szakaszt lentebb.

A játék a Pokira is fel van téve, az a build a `poki upload/` mappában van. A két portál SDK-ja teljesen külön kódban van (`src/platforms/crazygames.js` és `src/platforms/poki.js`), és mindegyik build csak a saját SDK-ját tölti be, így az egyiken végzett változtatás a másikat nem érinti.

## Mit csinál a CrazyGames SDK a játékban

A `game/index.html` a `<head>`-ben betölti a CrazyGames HTML5 SDK v3-at (`https://sdk.crazygames.com/crazygames-sdk-v3.js`). A játék:

- indításkor `await CrazyGames.SDK.init()`-et hív, és csak utána olvassa be a mentést;
- a **haladást** (feloldott pályák, rekordok, csillagok, titkok, eredmények, Endless rekord) és a **beállításokat** a **data modulon** keresztül menti (`SDK.data.getItem` / `setItem`), így bejelentkezett játékosnál a CrazyGames-fiókba kerül, és minden eszközön megvan; vendégnél a CrazyGames a böngészőben tárolja;
- betöltéskor `loadingStart` / `loadingStop`, játék közben `gameplayStart`, szünetnél, halálnál, menüben és pálya végén `gameplayStop` hívást küld;
- pálya teljesítésekor `happytime()`-ot hív;
- minden pályakezdés előtt midgame reklámot kér (lentebb részletesen);
- figyeli a portál **némítás** (`muteAudio`) beállítását, és ha be van kapcsolva, elhallgat;
- a CrazyGames-en elrejti a saját teljes képernyő gombját (a portálnak saját gombja van), a jobb klikk menüt és a szövegkijelölést letiltja.

Ha az SDK nem érhető el (például reklámblokkoló miatt), a játék 5 másodperc után nélküle indul, és a böngésző localStorage-ába ment.

**Reklám:** a játék minden pályakezdés előtt kér egy **midgame** reklámot (`SDK.ad.requestAd('midgame', …)`), amíg a betöltő kártya látszik — ez az a pályák közti pillanat, ahova a CrazyGames a midgame reklámot szánja. A reklám alatt a játék áll és néma, utána magától folytatódik. Ha a reklám hibára fut, vagy ha az SDK el sem indítja (saját szabálya szerint kb. háromperces időkorlát van, és az azon belüli kérést csendben eldobja, visszajelzés nélkül), a játék 2,5 másodperc után továbbmegy — sosem fagy le egy olyan reklám mögött, ami nem jön.

**Halál utáni újraindításnál nincs reklám.** Ez szándékos: ott a játékos kattintására azonnal vissza kell kapnia az egérvezérlést.

Ha **nem** akarsz reklámot, a `src/platforms/crazygames.js`-ben az `ads: true`-t írd át `ads: false`-ra, és futtass egy `npm run build`-ot.

## Ha a portál azt írja, hogy "The game could not be loaded"

Három oka lehet, sorrendben a leggyakoribbtól:

1. **Az `index.html` nem a zip gyökerében van.** Ha a `game` mappát zippelted be, akkor a zipben `game/index.html` van, és a portál nem találja a belépési pontot. Ezért van most kész zip: töltsd fel a **`one-way-out-crazygames.zip`**-et, abban az `index.html` biztosan a gyökérben van. (Ezt a `npm run build` írja meg, és a `node tests/portal.mjs` ki is bontja és el is játssza, szóval nem tud elromlani.)
2. **A portál nem szolgálja ki a `game.js`-t** (kimaradt a feltöltésből). Ilyenkor a **`one-way-out-crazygames-onefile.zip`** a megoldás: abban a játék kódja az `index.html`-ben van, nincs második fájl, ami elveszhet.
3. **Csak lassú volt a letöltés.** Ezt a játék korábban hibának vette: 8 másodperc után kiírta a saját hibaüzenetét, pedig utána rendben elindult. Ez javítva van: a figyelő most 45 másodpercig vár, a tényleg hiányzó fájlt megnevezi, a lassút pedig békén hagyja, és amint a kód lefut, az üzenet eltűnik.

A játékban magában nem volt hiba: a `node tests/portal.mjs` a feltöltendő zipet kibontva, HTTP-n kiszolgálva, **másik origin alóli iframe-ben** (tehát pontosan úgy, ahogy a CrazyGames futtatja) elindítja és végig is játszik vele egy pályát — SDK-val és SDK nélkül is.

## Tesztelés feltöltés előtt

A portál "Preview" / QA eszközében ellenőrizd, hogy a menü betöltődik, egy pálya elindul, és újratöltés után megmarad a haladás. Helyben:

```sh
npm run build          # újragenerálja a game/ mappát a src/-ből
node tests/sdk-crazygames.mjs   # SDK-integráció egy SDK-utánzattal
node tests/mobile.mjs  # érintéses irányítás telefon-emulációban
node tests/boot.mjs    # a betöltésfigyelő, és hogy az egyfájlos build magában is elindul
node tests/portal.mjs  # a feltöltendő zip kibontva, iframe-ben, mint a portálon
```

A borítók és videók újragenerálása: `node tools/covers.mjs`, `node tools/video.mjs landscape`, `node tools/video.mjs portrait`.
