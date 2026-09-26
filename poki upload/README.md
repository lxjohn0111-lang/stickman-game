# One Way Out – Poki feltöltés

Ebben a mappában minden megvan, ami a Poki fejlesztői portálra (developers.poki.com) kell. Nincs benne zip, minden sima fájl.

| Mit | Hova |
| --- | --- |
| `game/` mappa tartalma: `index.html` + `game.js` | A játék fájljai. Az `index.html` legyen a gyökérben, a `game.js` mellette. Kb. 1,1 MB, 2 fájl. |
| `description.txt` | Rövid és hosszú leírás (angol) |
| `controls.txt` | Irányítás (billentyűzet + egér, érintés) |

A borítóképek és az előnézeti videók a `crazygames upload/covers` és `crazygames upload/video` mappában vannak; ugyanazok a képek és videók a Pokihoz is jók (a Poki más méreteket kérhet, azt a portál írja ki feltöltéskor).

## Mit csinál a Poki SDK a játékban

A `game/index.html` a `<head>`-ben betölti a Poki SDK-t (`https://game-cdn.poki.com/scripts/v2/poki-sdk.js`). A játék:

- indításkor `await PokiSDK.init()`-et hív, és csak utána olvassa be a mentést;
- `gameLoadingStart()` / `gameLoadingFinished()` jelzést küld **a játék első betöltéséről**. A pályák közti betöltés nem számít újra betöltésnek, mert a Poki ezt a párost a betöltési és a "beindulási" statisztikához használja;
- `gameplayStart()` / `gameplayStop()` jelzést küld: játék közben start, szünetnél, ablakváltásnál, halálnál, menüben és a pálya végén stop;
- **`commercialBreak()`-et hív minden pályakezdés előtt**, amíg a betöltő kártya látszik. A reklám alatt a játék áll és néma, utána magától folytatódik. Hogy tényleg legyen-e reklám, azt a Poki dönti el;
- pálya teljesítésekor `happyTime(1)`-et hív;
- hibát `captureError()`-ral jelez.

**Halál utáni újraindításnál nincs reklám.** Ez szándékos: ott a játékos kattintására azonnal vissza kell kapnia az egérvezérlést, egy reklám viszont ezt megszakítaná. Ha mégis szeretnél ott is reklámot, egy sor a `src/main.js`-ben (`_afterRestart` elé egy `await this.adBreak()`), de akkor a játékosnak a reklám után egyszer kattintania kell az egér visszafogásához.

**Mentés:** a Pokinak nincs felhős mentése, ezért a haladás a böngésző localStorage-ába kerül. (A CrazyGames-en ugyanez a fiókba megy, de az egy külön build.)

Ha az SDK nem érhető el (reklámblokkoló, hálózati hiba), a játék 5 másodperc után nélküle indul, reklám nélkül, localStorage-dzsal.

## Poki követelmények, amikre figyeltem

- **Méret:** a teljes játék kb. 1,1 MB, a Poki limitje 5 MB első betöltésre és 8 MB összesen.
- **Nincs külső kérés:** a játék minden grafikát, hangot és zenét betöltéskor állít elő, nem tölt le semmit. Az egyetlen külső hivatkozás maga a Poki SDK.
- **Nincs külső link** a játékban.
- **Mobil:** érintéses irányítás, a menü álló helyzetben is használható, a játék fekvő helyzetet kér.
- **Szünet:** Esc billentyűvel, illetve a szünet gombbal érintőképernyőn.

## Tesztelés feltöltés előtt

```sh
npm run build              # újragenerálja a game/ mappát a src/-ből
node tests/sdk-poki.mjs    # Poki SDK-integráció egy SDK-utánzattal
node tests/mobile.mjs      # érintéses irányítás telefon-emulációban
```

A Poki Inspectorával a `game/` mappát lehet betölteni.

Helyben a `?platform=poki` illetve `?platform=crazygames` paraméterrel lehet kikényszeríteni, melyik SDK-t használja a játék, `?platform=none`-nal pedig egyiket sem.
