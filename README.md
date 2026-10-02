# LUCID Availability

Een volledig statische webapplicatie (HTML + CSS + JavaScript, geen frameworks, geen CDN) waarmee:

- **studenten** hun beschikbaarheid per kwartier doorgeven: 🔴 fysiek, 🟡 alleen online of ⬜ niet beschikbaar;
- de **coördinator** de bestanden van de hele groep inlaadt en automatisch alle gemeenschappelijke vergadermomenten vindt.

De site werkt rechtstreeks op **GitHub Pages** en zelfs gewoon lokaal vanaf je harde schijf.

---

## 1. Projectstructuur

> **Deze versie is "plat"**: alle bestanden staan in één map, zodat je ze makkelijk via de GitHub-website kan uploaden (selecteer alles en sleep het naar *Upload files*). De stijl staat in `style.css`, de scripts in `*.js`, het logo en de lettertypes naast de HTML-bestanden. Het e-mailscript heet hier `apps-script-Code.gs` en de uitleg `EMAIL-INDIENEN.md`. Voorbeeldgegevens: `voorbeeldgegevens.json`.

Oorspronkelijke (gestructureerde) indeling ter referentie:

```
LUCID-Availability/
├── index.html                 Startpagina (keuze student / coördinator)
├── availability.html          Studentenpagina (3 stappen)
├── coordinator.html           Coördinatorpagina (upload, filters, resultaten, heatmap)
├── .nojekyll                  Zegt GitHub Pages dat het de bestanden ongewijzigd moet tonen
├── css/
│   └── style.css              Volledige design language (kleuren uit het LUCID-logo)
├── js/
│   ├── config.js              Instellingen (e-mailadres, optioneel indien-endpoint) – GEEN geheimen
│   ├── core.js                Gedeeld: datums, tijdzone Brussel + klokwissel, JSON-schema, validatie
│   ├── matcher.js             Algoritme dat gemeenschappelijke momenten zoekt
│   ├── ui.js                  Veilige DOM-hulpfuncties, iconen, meldingen
│   ├── availability.js        Logica studentenpagina
│   └── coordinator.js         Logica coördinatorpagina
├── assets/
│   ├── lucid-logo.png         Logo (transparante achtergrond)
│   ├── lucid-mark.png         Loper uit het logo (decoratie)
│   ├── favicon.png, apple-touch-icon.png, og-image.png
│   └── fonts/                 Inter + Poppins (lokaal, OFL-licentie)
├── samples/                   8 fictieve studentenbestanden + index.json
│   └── invalid/               Opzettelijk foute bestanden om de foutmeldingen te testen
├── apps-script-Code.gs   Optionele, veilige indien-service (zie docs)
├── docs/
│   ├── EMAIL-INDIENEN.md      Voorstel en installatie van het automatisch indienen
│   └── lucid-availability.schema.json   Formeel JSON-schema (v1)
└── tests/
    ├── run-tests.js           Automatische tests van validatie + algoritme (Node.js)
    └── generate-samples.js    Maakt de voorbeeldbestanden opnieuw aan
```

Alle paden zijn **relatief**, dus de site werkt ook onder `https://<gebruikersnaam>.github.io/LUCID-Availability/`.

---

## 2. Hoe het werkt

### Studentenpagina
1. **Gegevens**: voornaam, familienaam, start- en einddatum (max. 62 dagen, niet volledig in het verleden). Er zijn snelknoppen voor *deze week*, *volgende week* en *komende 2 weken*. Een eerder gedownload bestand kan je opnieuw openen om aan te passen.
2. **Beschikbaarheid**: per dag een tijdlijn van 96 kwartieren.
   - Kies **Fysiek**, **Alleen online** of **Wissen** (ook met de toetsen 1, 2 en 3) en **klik + sleep**. Tijdens het slepen zie je live het interval, bv. *14:00 – 18:00 · Fysiek · 4 uur*.
   - **Shift+klik** breidt uit vanaf je vorige klik. Eén klik op een gekleurd blok zet het weer uit.
   - **Smartphone/tablet**: horizontaal vegen over de tijdlijn selecteert, verticaal vegen scrollt gewoon. Je kan ook *tik op begin → tik op einde*. De dag wordt automatisch over meerdere rijen verdeeld, zodat je nooit zijwaarts hoeft te scrollen.
   - Snelfuncties: *Tijdvak* (begin- en einduur kiezen, ook toetsenbordvriendelijk), *Vorige dag kopiëren*, *Kopieer naar…* (met snelkeuze werkdagen, weekend of zelfde weekdag), *Hele dag fysiek/online/wissen*, *Zelfde tijdvak op meerdere dagen*, *Alles wissen*, **ongedaan maken/opnieuw** (Ctrl+Z / Ctrl+Y) en nachturen verbergen.
   - Onder elke dag staan de tijdvakken ook als tekst, met een ✕ om ze te verwijderen.
3. **Controleren & indienen**: samenvatting (dagen, uren fysiek en online, overzicht per dag). Daarna **Download beschikbaarheidsbestand** en een knop die een e-mail aan de coördinator opent.

Het concept wordt automatisch in de browser bewaard. Bij terugkeer vraagt de site eerst *"Ben jij dit?"* en toont nog geen gegevens, zodat een volgende student op een gedeeld toestel niets van de vorige ziet. Na 7 dagen wordt het concept automatisch verwijderd, en er is een knop **Mijn gegevens van dit toestel wissen**.

### Coördinatorpagina
1. Sleep de JSON-bestanden in de dropzone (meerdere tegelijk). Elk bestand wordt afzonderlijk gecontroleerd. Een fout bestand geeft een duidelijke melding, maar breekt niets.
2. Je ziet de deelnemerslijst (verwijderen kan per persoon, met *ongedaan maken*) en de gemeenschappelijke periode. Laad je dezelfde persoon twee keer, dan wint de **nieuwste** versie.
3. Kies de **vergaderduur** (15 min t/m 4 uur, per 15 min) en de filters (datum, uren, weekdagen, type). Klik daarna op **Zoek gemeenschappelijke momenten**. Daarna worden de resultaten meteen bijgewerkt als je een filter wijzigt.
4. Je krijgt een **heatmap** per dag (hover of tik: *Fysiek 6/8 · Online 2/8 · Niet beschikbaar 0/8*) en de **resultaten**, chronologisch of per type.

Via **Uitnodigingslink** maak je een link zoals `availability.html?start=2026-10-05&end=2026-10-18`. Daarin ligt de periode al vast, zodat iedereen dezelfde dagen invult.

**Privacy:** de bestanden worden alleen in het geheugen van je browser gelezen. Er gaat niets naar GitHub of een andere server en er wordt niets bewaard. Sluit je de pagina, dan is alles weg.

### Rekenregels
- Alleen dagen waarvoor **alle** deelnemers gegevens hebben, worden geanalyseerd.
- Voor elke starttijd (per 15 min) wordt gekeken naar het **volledige** interval. Voor 60 minuten zijn dus 4 opeenvolgende geschikte kwartieren nodig.
- Elke starttijd krijgt precies één categorie:
  - 🔴 **Iedereen fysiek**: iedereen is het hele interval `physical`;
  - 🟡 **Iedereen alleen online**: iedereen is het hele interval `online`;
  - 🔴🟡 **Iedereen beschikbaar – fysiek of online**: niemand is `unavailable`, maar minstens één persoon is niet het hele interval fysiek. Wie deels fysiek en deels online is, staat bij **Online nodig**.
- Opeenvolgende starttijden met dezelfde categorie en dezelfde "online nodig"-groep worden samengevoegd tot één venster: *Beschikbaarheidsvenster 18:00–22:00 · Vergaderduur 60 min · Mogelijke starttijden 18:00 t/m 21:00*. De individuele starttijden kan je openklappen.
- Er is geen subjectieve "beste moment"-score.

### Tijdzone en klokwissel
Alle tijden zijn **lokale kloktijden in Europe/Brussels**, ongeacht de tijdzone van het toestel (getest met een browser in New York). Op de dag van de klokwissel bestaat 02:00–03:00 niet (eind maart) of komt dat uur twee keer voor (eind oktober). Die blokken zijn op die dag niet selecteerbaar en tellen nooit mee in een vergadering. Er is dus nooit dubbelzinnigheid.

---

## 3. Het bestandsformaat (JSON, versie 1)

```json
{
  "schema": "lucid-availability",
  "version": 1,
  "participant": { "firstName": "Ali", "lastName": "Alhayek", "fullName": "Ali Alhayek" },
  "period": { "start": "2026-10-05", "end": "2026-10-18" },
  "timezone": "Europe/Brussels",
  "slotMinutes": 15,
  "submittedAt": "2026-10-02T16:10:00+02:00",
  "generator": { "app": "LUCID Availability", "version": "1.0.0" },
  "summary": { "days": 14, "daysWithAvailability": 10, "physicalMinutes": 1920, "onlineMinutes": 480 },
  "days": {
    "2026-10-05": [
      { "start": "14:00", "end": "18:00", "status": "physical" },
      { "start": "18:00", "end": "19:30", "status": "online" }
    ],
    "2026-10-06": []
  }
}
```

- **Compact en leesbaar**: alleen aaneengesloten tijdvakken, geen 96 losse waarden per dag. Alles wat er niet in staat, is `unavailable`.
- **Valideerbaar**: tijden op het kwartierraster (`24:00` mag als eindtijd), geen overlap, alleen `physical` / `online` / `unavailable`, en elke dag van de periode aanwezig (een lege lijst betekent heel de dag niet beschikbaar). Zie `docs/lucid-availability.schema.json` en `validateDocument()` in `js/core.js`.
- **Uitbreidbaar**: onbekende extra velden worden genegeerd. Een toekomstige `version: 2` wordt herkend en geweigerd met een duidelijke melding.
- `summary` is alleen informatief. De coördinatorpagina rekent zelf.

---

## 4. Lokaal testen

### Snelste manier
Dubbelklik op `index.html`. Alles werkt, behalve de knop *Voorbeeldgegevens laden* (browsers blokkeren `fetch` bij `file://`). Gebruik in dat geval de dropzone met de bestanden uit `samples/`.

### Met een lokale webserver (aanbevolen, net als GitHub Pages)
Open een terminal in de map `LUCID-Availability` en voer **één** van deze commando's uit:

```bash
python3 -m http.server 8000        # macOS / Linux   (Windows: py -m http.server 8000)
npx serve .                         # als Node.js geïnstalleerd is
```

Surf daarna naar <http://localhost:8000>.

### Automatische tests (Node.js 18+)
```bash
node tests/run-tests.js
```
Je zou **24 geslaagd, 0 mislukt** moeten zien. De tests dekken onder meer:

| Scenario | Verwacht |
|---|---|
| 1 student, fysiek 18:00–22:00, 60 min | 1 venster, starttijden 18:00 t/m 21:00 (13) |
| 8 studenten iedereen fysiek | categorie *Iedereen fysiek*, 8/8 |
| los blok van 15 min bij 60 min | **geen** resultaat (bij 15 min wel) |
| iedereen online | categorie *Iedereen alleen online* |
| 6 fysiek + 2 online | *fysiek of online*, 6 fysiek · 2 online, met namen |
| deels fysiek, deels online in hetzelfde interval | telt als *online nodig* |
| iemand niet beschikbaar | venster wordt correct onderbroken |
| verschillende/overlappende periodes | alleen gemeenschappelijke dagen, ontbrekende dagen gemeld |
| periodes zonder overlap | geen gemeenschappelijke dagen |
| foutief JSON, verkeerde status, overlap, verkeerde tijdzone, nieuwere versie | duidelijke fout, geen crash |
| ontbrekende dag | waarschuwing, bestand wel bruikbaar |
| klokwissel 25 okt 2026 en 29 maart 2026 | 02:00–03:00 geblokkeerd, vergadering loopt er niet over |
| filters (uren, weekdagen, type, datum) en sortering | correct |

### Handmatig testen (± 5 minuten)
1. **Student**: vul in, sleep een paar tijdvakken, probeer *Kopieer naar…*, *Ongedaan maken* en *Vernieuwen* (F5). Je krijgt de vraag *"Ben jij dit?"*. Download het bestand.
2. **Coördinator**: sleep de 8 bestanden uit `samples/` erin, plus je eigen bestand en de bestanden uit `samples/invalid/`. Bekijk de foutmeldingen, zoek momenten van 60 en 120 minuten, en speel met de filters.
3. **Smartphone**: open de site via GitHub Pages op je gsm, of in Chrome via *F12 → apparaatwerkbalk*.

---

## 5. Online zetten met GitHub Pages (stap voor stap)

### A. Repository maken
1. Meld je aan op <https://github.com>.
2. Klik rechtsboven op **+** → **New repository**.
3. *Repository name*: `LUCID-Availability`. Kies **Public** (GitHub Pages is gratis voor publieke repositories).
4. Vink niets extra aan en klik **Create repository**.

### B. Bestanden uploaden (zonder programmeerkennis)
1. Pak het zip-bestand uit op je computer.
2. Klik in je nieuwe repository op **uploading an existing file** (of *Add file → Upload files*).
3. Open de uitgepakte map `LUCID-Availability` en sleep **de inhoud** ervan (alle bestanden en mappen, dus `index.html`, `css`, `js`, …) naar het uploadvak. Sleep dus niet de map zelf.
   > Tip: op Windows/macOS kan je in de map *Ctrl+A* / *Cmd+A* doen en alles tegelijk slepen. Het verborgen bestand `.nojekyll` is niet strikt nodig.
4. Onderaan: *Commit changes* → **Commit changes**.
5. Controleer dat `index.html` rechtstreeks in de hoofdmap van de repository staat, niet in een submap.

### C. GitHub Pages activeren
1. Ga in de repository naar **Settings** → **Pages** (in het linkermenu).
2. Bij *Build and deployment* → *Source*: kies **Deploy from a branch**.
3. *Branch*: **main** en map **/ (root)**. Klik **Save**.
4. Wacht 1 à 2 minuten en vernieuw de pagina. Bovenaan verschijnt *"Your site is live at"*:
   `https://<jouw-gebruikersnaam>.github.io/LUCID-Availability/`

### D. Delen
- Stuur studenten de link naar de startpagina, of beter: maak op de coördinatorpagina een **uitnodigingslink** met vaste periode.
- De coördinatorpagina is technisch publiek, maar bevat **geen gegevens**. Ze verwerkt alleen bestanden die jij zelf in je eigen browser sleept.

### E. Later iets wijzigen
- **Via de website**: open het bestand op GitHub → potloodicoon (*Edit*) → wijzig → **Commit changes**. Of gebruik *Add file → Upload files* om een bestand met dezelfde naam te vervangen.
- **Met GitHub Desktop** (handig bij veel wijzigingen): *File → Clone repository*, wijzig de bestanden lokaal en kies daarna *Commit to main → Push origin*.
- Na elke commit staat de nieuwe versie binnen ± 1 minuut online (status: tabblad **Actions**). Zie je de oude versie nog? Vernieuw dan met Ctrl+F5.

---

## 6. Automatisch indienen per e-mail

Zie **[EMAIL-INDIENEN.md](EMAIL-INDIENEN.md)**. Kort samengevat: een gratis **Google Apps Script web app** onder het LUCID-Gmail-account. Daarvoor is geen enkel wachtwoord of geheim in de repository nodig. Je activeert het door één URL in `config.js` in te vullen. Tot dan krijgt de student de veilige downloadknop.

---

## 7. Beveiliging & privacy

- Geen wachtwoorden, API-secrets of private keys in de code (controleer gerust `config.js`).
- Geen externe scripts, CDN's, cookies of tracking. Lettertypes en iconen staan in de repository.
- Geïmporteerde bestanden worden als onbetrouwbare input behandeld: max. 2 MB, `JSON.parse` in try/catch, strikte validatie, opgeschoonde namen, en gebruikersdata komt alleen via `textContent` in de pagina (nooit via `innerHTML`).
- De coördinatoranalyse gebeurt 100% client-side.

## 8. Uitbreidbaarheid

De architectuur is voorbereid op:
- **automatisch e-mailen**: al ingebouwd via `submitEndpoint`;
- **unieke meetinglinks / meerdere groepen**: de uitnodigingslink kan uitgebreid worden met `&group=…`, en het schema kan een optioneel veld `group` krijgen;
- **export naar `.ics` / Google Calendar**: elk resultaat bevat al de exacte datum, begin- en eindtijd in Europe/Brussels;
- **deadline, herinneringen, opgeslagen vergaderingen, resultaten delen**: daarvoor is een kleine backend nodig, bijvoorbeeld hetzelfde Apps Script met een Google Sheet als opslag.

Nieuwe velden in het JSON-bestand breken oudere versies niet. Wijzigt de structuur echt, verhoog dan `version`.
