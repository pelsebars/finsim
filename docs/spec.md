# FinSim – Specifikation v03

## Indledning

FinSim er et program der tillader simuleringer af privat økonomi. Med FinSim kan man simulere forskellige finansielle assets og udviklingen af disse over tid. Man kan f.eks. indlægge lån, ejendomme, pension og så videre, og simulere udviklingen af disse med scenarier.

Overordnet ligner FinSim et gantt-kort. Assets strækker sig over tid, og kan "kobles" til andre assets. En opsparing kan f.eks. "føde" over i en ejendom.

Den første version af FinSim regner kun på formue, ikke på løbende udgifter.

**Talformat:** En million vises i UI'et som `1.000` (de sidste 3 nuller vises ikke). Data indtastes på samme måde — vil brugeren indtaste en million, indtastes `1.000`.

Simuleringen har en total værdi til et givet tidspunkt, givet ved al den værdi der kommer ind i simuleringen gennem assets' initielle værdier, forrentet over tid. Simuleringen kan miste værdi hvis penge trækkes ud via éngangs-betalinger, låne-omkostninger eller udbetalingsfunktioner. Tilsvarende kan simuleringen tilføres værdi ved indbetalinger udefra.

---

## Kontekst

En simulering findes i en tidsmæssig kontekst. Når en ny simulering startes, angiver man start- og slutdato. Dato angives i hele måneder (januar, februar, marts…). Simuleringens "clock-frekvens" er i hele måneder: `t1 = t0 + 1 måned`.

Renter angives i pro anno i brugerens indtastningsfelter, men simuleringen beregner internt i måneder. En årlig rente på X% omregnes til en månedlig rente via: `månedlig rente = (1 + X/100)^(1/12) - 1`.

Brugeren bygger sin simulering op som et gantt-diagram: man tilføjer assets, som kan linkes til hinanden. Et "forælder-asset" kan afgive sin værdi til "child-assets".

---

## Grundlæggende data

### Master class (nedarves af alle asset-typer)

| Attribut | Beskrivelse |
|---|---|
| Navn | Brugerdefineret |
| Startdato | Datoen for asset'ets "fødsel" — brugerdefineret |
| Slutdato | Datoen for asset'ets afslutning — brugerdefineret |
| Initiel værdi | Brugerdefineret. Grået ud og ikke redigerbar hvis asset er et child-asset |
| Beregnet slutværdi | Beregnes ud fra initiel værdi og angivet forrentning |

Systemet holder styr på værdien til ethvert tidspunkt `t`. Via mouse-over på gantt-"pølsen" vises værdien på det tidspunkt cursoren befinder sig (dato + værdi). På dynamic assets kan der udtages værdi undervejs; efter en udtrækning forrentes restværdien videre.

---

### Asset-typer

#### Aktiebeholdning (dynamic)
- **Forrentning:** Fast årlig rente (pro anno, omregnes internt til månedlig)

#### Likvid beholdning (dynamic)
- **Forrentning:** Fast årlig rente (pro anno, omregnes internt til månedlig)

#### Pension (dynamic)
- **Forrentning:** Fast årlig rente (pro anno, omregnes internt til månedlig)

#### Fast ejendom (simple)
Forrentning kan angives på to måder:
1. Fast årlig rente
2. Rente per år, f.eks. `2026: 10%`, `2027: 4%`, `Andre år: 2%`. Hvis "Andre år" ikke angives, bruges **2% som default**.

Herudover har fast ejendom en mæglergebyr-udgift ved salg:
- Brugerdefineret beløb, **default: 100.000 DKK**
- Fratrækkes på slutdatoen og "forlader" simuleringen
- Eksempel: Ejendom værd 10.000.000 med gebyr 100.000 → **9.900.000 sendes videre til child-asset**

#### Lån (special)
- Lånets værdi er **konstant negativ** i hele dets levetid (startværdi = slutværdi)
- **Version 1: ingen renter, ingen afdrag**
- Lån har **aldrig parent og aldrig child** — det er altid "sig selv"
- Ekstra attribut: **Etableringsomkostninger** — éngangsudgift ved `t = startdato`, fratrækkes simulationens samlede indre værdi på starttidspunktet

---

## Et assets "life-cycle"

### Simple assets
Har en primo-værdi og en ultimo-værdi. Kan ikke tilføres eller udtrækkes værdi undervejs. Gælder: **fast ejendom** og **lån**.

### Dynamic assets
Kan tilføres eller udtrækkes værdi undervejs i deres livscyklus. Gælder: **aktier**, **likvid beholdning** og **pension**.

---

## Value flow

### Med eller uden parent

Et asset kan starte på to måder:
1. **Uden parent:** Antager sin brugerdefinerede startværdi. Brugeren angiver en specifik dato eller "simulationsstart".
2. **Med parent (child-asset):** Modtager sin startværdi fra parent-asset'et på parent-asset'ets slutdato. Child-asset'ets startdato skal være lig med eller efter parent-asset'ets slutdato.

**Regler for parent/child:**
- Alle asset-typer kan have alle typer som parent eller child — **undtagen lån**, som aldrig har parent eller child.

### Med eller uden child

Hvis et asset ender uden child, tilføjer UI'et automatisk en **"cash out"-node** med asset'ets slutværdi.

Hvis et asset har "værdi til overs" — dvs. child-assets ikke opsorberer 100% af den tilgængelige værdi — vises en advarsel på parent-asset'et:
> `13.000.000 – Bemærk: 1.200.000 til overs`

Dette gælder også assets der endnu ikke har fået tildelt et child-asset.

### Forgrening

Parent-assets sender værdier videre til child-assets via forgrenings-noder. Der er to typer:
- **Beløb:** Et fast kronebeløb, f.eks. `10.000`
- **Procent:** En procentdel, f.eks. `42%`

Når brugeren tilføjer en forgrening, fremkommer en pop-up hvor brugeren:
1. Vælger type (beløb eller procent)
2. Vælger det asset beløbet kommer fra
3. Vælger det asset beløbet skal gå til

Hvis children tilsammen overstiger 100% / den tilgængelige sum, vises en valideringsfejl.

---

## Editering og sletning af assets

Klik på et asset eller en funktion i gantt-viewet for at redigere alle felter.

En **"Slet"-knap** er tilgængelig nederst i redigeringsvinduet. Sletning kræver brugerbekræftelse.

- **Sletning af asset med parent:** Den nu "frie" sum efterlades som en kontant udbetaling på parent-asset'et.
- **Sletning af asset med children:** Hele "træet" nedenfor farves **rødt** for at indikere fejl-state. Grafer beregnes ikke og vises som **"NA"** så længe der er assets i fejl-state.

---

## Funktioner der virker på assets

**Gælder for:** likvid, aktier, pension (dynamic assets).

Der er to måder at tilføre/udtage værdi på:
1. **Udefra/ud af simuleringen:** Penge tilføres simuleringen "udefra" eller trækkes helt ud.
2. **Mellem assets:** Værdi flyttes fra ét asset til et andet — pengene forbliver i simuleringen.

### Éngangs-ind/udbetaling
Defineres ved:
- Beløb
- Om pengene kommer fra / skal gå til et andet asset (vælges fra dropdown)
- Dato (kun måneder hvor det valgte asset er aktivt)

**Visning:** Grøn cirkel = indbetaling, rød cirkel = udbetaling. Beløbet vises ved siden af cirklen. Placering følger datoen på tidslinjen.

Flow mellem assets vises med en pil mellem de to assets, placeret korrekt på tidslinjen.

### Kontinuerte ind/udbetalinger
Defineres ved:
- Interval (antal måneder mellem betalingerne; `1` = hver måned)
- Beløb per betaling
- Om pengene kommer fra / skal gå til et andet asset (vælges fra dropdown)
- Start- og slutdato (kun måneder hvor det valgte asset er aktivt)

**Visning:** Grøn/rød pil placeret midt på gantt-"pølsen". Det totale ind/udbetalte beløb vises ved siden af pølsen.

---

## User Interface

### Overordnet layout

Skærmen er delt i 3 hoved-områder (top til bund):

1. **Kommando-område** — fast højde, indeholder overordnede funktioner
2. **Gantt-område** — assets vises her; højde justeres med slider
3. **Graf-område** — minimum 20% af skærmhøjden

Mellem gantt og grafer er der en **vertikal slider** til at justere fordelingen. Gantt zoomes ikke vertikalt — der vises blot flere eller færre assets afhængig af størrelsen.

Graferne skalerer altid til at vise maksimum og minimum, uanset antal pixels.

**Horisontal scroll-bar** nederst til at scrolle over hele simuleringsperioden.
**Vertikal scroll-bar** i gantt-området hvis ikke alle assets kan vises.

### Gantt-området

Gantt-"pølserne" er **låst i x-retningen** (kan ikke flyttes horisontalt). Enderne kan trækkes for at justere start- og slutdato. Assets kan **flyttes frit vertikalt** (drag and drop) for at skabe overblik.

### Graf-området

- **Graf 1:** Sum af positive assets (likvider, aktier, pension, bolig)
- **Graf 2:** Sum af gæld (lån)
- **Graf 3:** Nettotal (graf 1 + graf 2)

---

## Kommando-området

| Funktion | Beskrivelse |
|---|---|
| **Load** | Henter et tidligere gemt projekt fra backend |
| **Save** | Gemmer projektet til backend |
| **+Asset** | Pop-up: vælg asset-type → indtast parametre |
| **+Ny funktion** | Pop-up: vælg funktionstype (1-gangs indbetaling/udbetaling, kontinuert indbetaling/udbetaling) |
| **Zoom ind** | Steps af hele år; minimum 1 år |
| **Zoom ud** | Steps af hele år; maksimum = hele simuleringsperioden. Default ved opstart = hele perioden vist |
| **Medtag pension** | Toggle: OFF = pension indgår ikke i nettoberegningen, men vises stadig i gantt |

---

## Visning af asset-typer

Alle assets har mørkere ender på gantt-"pølsen" for at indikere at de kan trækkes i tid. Start- og slutværdi vises i hhv. start og slut af pølsen.

| Asset-type | Ikon | Label |
|---|---|---|
| Bolig | 🏠 | Navn + forrentning (gennemsnit hvis variabel) |
| Aktier | 📄 | Navn + forrentning |
| Pension | 🏖️ | Navn + forrentning |
| Likvid | 💰 | Navn + forrentning |
| Lån | 🏦 | Navn (ingen rente at vise) |

### Rendering af pile mellem assets
Pil tegnes fra enden af parent-asset til starten af child-asset. Parent-pølsen forkortes 15px og child-pølsen starter 15px sent, så pilen har plads til at blive tegnet horisontalt.

---

## Implementering

### Teknologi-stak

| Lag | Valg |
|---|---|
| Frontend | React (Next.js anbefales — dækker både UI og API-routes, deployes naturligt til Vercel) |
| Backend API | Next.js API-routes (eller separat Express/Node på Railway) |
| Database | PostgreSQL på Railway |
| Hosting | Vercel (frontend/API) + Railway (database) |
| Repo | GitHub — eksisterende repo: FinSim |

### Auth
- Email + password (simpel)
- Ingen OAuth, ingen MFA, ingen "glemt adgangskode" i version 1
- bcrypt til password-hashing, JWT i httpOnly cookie til session

### Multi-tenant
Flere brugere med separat data. Simpel data-separation uden avancerede løsninger.

### Data
Data gemmes til og hentes fra backend ved hhv. Save og Load.

---

## Implementerings-faser

### Fase 1 — Fundament & Auth
- Projekt-scaffolding (Next.js + Tailwind + TypeScript)
- PostgreSQL-forbindelse og `users`-tabel
- API-routes: register, login, logout, me
- Frontend: login- og registreringssider, beskyttet startside
- Basis app-shell (topmenu som placeholder for kommando-området)

### Fase 2 — Beregningsmotor (backend, ingen UI)
- Datamodeller for alle 5 asset-typer
- Månedlig renteomregning (`(1 + r)^(1/12) - 1`)
- Value flow: parent → child på parent's slutdato
- Dynamic vs. simple asset-logik
- Lånets konstante negative værdi + etableringsomkostninger
- Ejendoms-penalty fratrækkes inden videregivelse til child
- Enhedstest for alle beregninger

### Fase 3 — Gantt-visning
- Tidslinje-layout med korrekt skalering
- Rendering af alle 5 asset-typer (pølser, ikoner, start/slutværdier)
- Mørkere ender der kan trækkes for at justere datoer
- Pile mellem parent og child (15px-offset)
- Vertikal drag and drop
- Mouse-over tooltip (dato + værdi)

### Fase 4 — Funktioner
- Éngangs ind/udbetalinger (logik + gantt-visning)
- Kontinuerte ind/udbetalinger (logik + gantt-visning)
- Grøn/rød farvelogik

### Fase 5 — Grafer & interaktion
- De tre bundgrafer med dynamisk skalering
- Vertikal slider (gantt/graf-fordeling)
- Zoom ind/ud (steps af hele år)
- Pension-toggle
- Fejl-state (rød cascading ved sletning)
- "NA"-visning ved ugyldige assets
- "Til overs"-advarsel ved forgrening

### Fase 6 — Save/Load & polish
- Gem/hent simulering fra backend
- Default-værdier og inputvalidering
- Over-100%-validering ved forgrening
- Overordnet UI-polish
