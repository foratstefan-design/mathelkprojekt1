# mathelkprojekt — Höhenflug

Ein eigenständiges Wissensspiel auf Oberstufenniveau mit einer prozeduralen Pixel-Flugwelt. Interessante Fakten, konkrete Vergleichswerte und kurze Erklärungen verbinden Lernen mit Flugrekorden. Freie Flüge sind endlos und haben zwei Rettungschancen. Der Tagesflug besteht aus zehn gleichen Aufgaben für alle und führt eine Tagesbestenliste. Es werden keine Modellschlüssel benötigt.

## Lokal starten

Node.js **22.13 oder neuer**, empfohlen Node 24. Keine npm-Pakete erforderlich.

```sh
cd mathelkprojekt
npm start
```

`http://localhost:3000` öffnen. Anderer Port: `npm run dev -- --port 4173` oder `PORT` setzen. `DIVE_DATA_DIR` bestimmt das dauerhafte Verzeichnis für `hoehenflug.sqlite`, standardmäßig `./data`. Datenbank und WAL-Dateien sichern, nicht in Git speichern.

```sh
npm test
npm run build
node --check dist/server/index.js
node scripts/smoke-worker.mjs
```

Der Worker-Build funktioniert ohne Anbieter-Konfiguration. Für Sites muss eine eigene `.openai/hosting.json` aus der Beispieldatei angelegt werden. Für ein separates statisches Frontend steht `npm run build:static` bereit; das vollständige Spiel benötigt weiterhin das Backend.

## Regeln

Der Katalog enthält **160 Fragen**: je 32 für Häufig, Selten, Früher, Später und Allgemeinwissen. Die Einstiegsfragen verbinden zugängliches Allgemeinwissen mit interessanten Lernfakten; Vertiefung und Challenge bauen darauf auf. Jede kuratierte Frage enthält eine Erklärung und konkrete Quellen. Die Erklärungen bleiben ohne laufenden Timer sichtbar, bis „Weiterfliegen“ gewählt wird.

- **Freier Flug:** Gemischt, häufigste, seltenste, frühere oder spätere Antwort. Neue Flüge starten bei 0 Metern. Ein gespeicherter Flug wird ausdrücklich über seine Kennung fortgesetzt.
- Der erste Fehler oder Zeitablauf kostet bis zu **250 Meter**, der zweite in Folge bis zu **400 Meter**. Beide Male geht der Flug weiter, auch bei 0 Metern. Der **dritte Fehler in Folge** endet am Boden. Eine richtige Antwort rettet den Flug und setzt die Gefahr wieder auf 0.
- **Tagesflug:** Ein Versuch pro Gerätekennung und Kalendertag in **Europe/Berlin**. Um **00:00 Uhr Berliner Zeit** beginnt der neue Tag. Der Modus rotiert täglich durch **Selten → Häufig → Früher → Später**, mit Selten am 19.11.2026 als Anker. Alle erhalten dieselben **zehn Fragen in derselben Reihenfolge** und dieselben Zeitfenster. Der vollständige Tagesfragensatz wird beim ersten Start unveränderlich in `daily_challenges` gespeichert; auch spätere Inhalts-Deployments würfeln laufende Tageswettbewerbe nicht neu. Der Tagesflug startet bei **1.500 Metern**; jede falsche oder abgelaufene Antwort kostet bis zu **350 Meter**, mindestens bleibt 0. Auch dort werden alle zehn Aufgaben gespielt. Erst die zehnte Antwort beendet ihn mit `status: finished`. Ein gestarteter Versuch wird fortgesetzt und kann am selben Tag nicht neu ausgewürfelt werden.
- **Tagesbestenliste:** Nur vollständig beendete Tagesflüge des neuen Formats werden gewertet. Die Reihenfolge richtet sich nach der **Endhöhe**, dann Punkten, kürzerer aufsummierter Antwortzeit, früherem Start und einer stabilen Kennung. Die höchsten 20 Plätze und der eigene Platz werden angezeigt. Ein optionaler Rufname ist veränderbar; ohne Eingabe erscheint ein automatisch erzeugter Name. Es gibt weiterhin keine Anmeldung, daher gilt der Tagesversuch pro Browser-Gerätekennung, nicht geräteübergreifend pro Person.
- Die ersten **16 Aufgaben im freien Flug** nutzen den Einstieg. Vertiefung wird frühestens ab Frage 17 und **6.000 Metern Höhengewinn** bevorzugt, Challenge frühestens ab Frage 33 und **14.000 Metern**. Beide Bedingungen müssen erfüllt sein. Neue Tagesfragensätze enthalten **acht Einstiegsfragen und zwei Vertiefungen**, ohne Challenge-Fragen. Die feste Auswahl hängt nicht von der Spielerleistung ab; bereits gespeicherte Tagesfragensätze bleiben unverändert.
- Pro Flug werden bereits gespielte Fragen und ihre umgekehrten Vergleichsvarianten ausgelassen. Bei neuen freien Flügen berücksichtigt die Auswahl die **letzten 200 freien Antworten desselben Geräts** und bevorzugt ungesehene passende Fragefamilien. Sind die geeigneten Familien bereits bekannt, wird eine länger nicht gespielte Einstiegsfrage wiederverwendet, bevor schwierigere Inhalte vorgezogen werden. Erst wenn innerhalb eines Flugs alle passenden kuratierten Familien verbraucht sind, folgen neue Transferaufgaben. Kategorien und Fragestämme der letzten drei Aufgaben werden dabei möglichst variiert. Der endliche Fragenkatalog garantiert keine unbegrenzte Einmaligkeit über alle Flüge hinweg.
- Neue Tagesfragensätze geben für jede Frage konstant **25 Sekunden**. Bereits gespeicherte Tageswettbewerbe behalten ihre früheren Fristen von 20 Sekunden minus 250 ms je Fragenposition sowie ihre unveränderten Fragen; alle Spieler desselben Wettbewerbs bleiben vergleichbar. Freie Flüge starten mit **22 Sekunden**. Jede insgesamt richtige Antwort verkürzt das nächste Fenster um **200 ms**, bis mindestens **8 Sekunden** bleiben. Fehler setzen diesen Fortschritt nicht zurück. Im Rettungsfenster bleiben **65 %** der normalen Zeit, mindestens **6 Sekunden**. Bereits scharfgeschaltete Fragen behalten immer ihren gespeicherten Zeitrahmen.
- Die Rückmeldung zwischen zwei Aufgaben ist untimed. Erst `/api/next` friert die konkrete nächste Frage ein und startet ihre volle Frist. Vorher bleiben die Antwortmöglichkeiten verborgen.
- Eine richtige Antwort gibt **10–30 Punkte** nach Antwortgeschwindigkeit und **150–500 Meter** nach Geschwindigkeit und Serienbonus. Die Höchstmarke bleibt auch nach Höhenverlust gespeichert.
- Die erste gespeicherte Wahl pro Fragenposition ist verbindlich. Wiederholungen liefern dieselbe Wertung. Automatischer Ablauf mit `expired:true` gibt 0 Punkte; manuell abgeschickte Antworten erhalten 500 ms Netzwerklatenz-Toleranz.
- Eine aktive Frist läuft beim Verlassen des Tabs weiter. Wiederaufnahme, Statistik oder Abruf verbuchen einen abgelaufenen unbeantworteten Versuch genau einmal. Die Folgefrage beginnt erst nach ausdrücklichem Weiterflug.

Der freie Flug hat keine feste Gesamtdauer und kein festes Höhenziel. Höhe ist der aktuelle Stand, `peakAltitude` die erreichte Höchstmarke, `streak` die aktuelle richtige Serie und `correctTotal` die Gesamtzahl richtiger Antworten.

## Struktur

```text
public/
  index.html              Oberfläche und Navigation
  app.js                  Auswahl, Timer, Flugzustand und Ergebnisse
  base.css                Gemeinsame responsive Bedienelemente
  style.css               Pixel-Flugoberfläche und Antwortmöglichkeiten
  sky.js                  Eigene Pixel-Flugwelt und Animationen
  art.js                  Eigene Flugzeug- und Figurenillustrationen
lib/
  questions.js            Gemeinsamer Fragenkatalog
  questions-frequency.js  Häufigkeits- und Anteilsvergleiche
  questions-time.js       Erfindungen und historische Meilensteine
  questions-general.js    Weiteres Oberstufenwissen mit Lernfakten
  engine.js               Adaptive Auswahl, Wiederholungsschutz und Wertung
  legacy-engine.js        Eingefrorene Auswahl für bereits laufende v1-Fragen
  legacy-questions.js     Unveränderte alte Fakten für faire Wiederaufnahme
  api.js                  Gemeinsame SQLite-/D1-Serverlogik
migrations/
  0001_initial.sql        Unverändertes ursprüngliches Node-Schema
  0002_v2.sql             Additive Felder für Tagesflug, Gefahr und Frage-Snapshot
  0003_daily_competition.sql Zehn-Fragen-Wertung, Tagesfragensatz, Antwortdauer und Rufnamen
drizzle/
  0000_initial.sql        Unverändertes ursprüngliches D1-Schema
  0001_v2.sql             Additive v2-Migration; kein Löschen bestehender Daten
  0002_daily_competition.sql Additive Tageswettbewerb-Migration
  meta/_journal.json     Journal der D1-Migrationen
scripts/
  build.mjs               Abhängigkeitsfreier Worker-Build
  build-static.mjs        Frontend-Build für andere Hoster
  smoke-worker.mjs        Prüfung des gebauten Workers mit SQLite-Adapter
tests/
  api.test.js             Timer, Rennen, Persistenz und Spielregeln
  engine.test.js          Faktenkatalog, Tagesauswahl und Bewertung
  frontend.test.js        Lernpause, Tagesabschluss, Wiederaufnahme und sichere Ausgabe
  sky.test.js             Modulprüfung der Flugszene
server.mjs                Node-HTTP-Server mit SQLite
.openai/hosting.example.json  Vorlage für ein eigenes Sites-Projekt
netlify.toml              Statisches Netlify-Frontend
vercel.json               Statisches Vercel-Frontend
```

## API

GET-Requests enthalten `device` im Querystring; POST-Requests im JSON-Body. Eine Gerätekennung besteht aus 16–100 Buchstaben, Ziffern, Unterstrichen oder Bindestrichen.

| Methode und Pfad | Zusätzliche Eingabe | Ergebnis |
| --- | --- | --- |
| POST `/api/start` | `{mode}` | Neuer freier Flug oder heutiger Tagesversuch |
| GET `/api/daily` | – | Berliner Datum, Tagesmodus, zehn Aufgaben, Profil und vorhandener Versuch |
| GET `/api/leaderboard?date=YYYY-MM-DD` | – | Top 20, eigener vollständiger Rang und Zahl beendeter Tagesflüge |
| GET `/api/profile` | – | Gespeicherter oder automatisch erzeugter Rufname |
| POST `/api/profile` | `{name}` | Rufname mit 2–20 Zeichen speichern |
| POST `/api/next` | `{runId}` | Aktuelle Frage mit laufendem Timer |
| POST `/api/answer` | `{runId, questionId, questionIndex, choiceId, expired?}` | Gespeicherte Wahl, Belohnung oder Absturz |
| GET `/api/run?id=…` | Flugkennung | Wiederaufnahme samt letzter Auflösung |
| GET `/api/stats` | – | Rekorde, Serien, Gesamtzahl und `byMode` |
| GET `/api/history` | – | Letzte 20 beendete Flüge |
| POST `/api/delete` | – | Zugeordnete Flug- und Antwortdaten löschen |

`mode` ist `daily`, `mix`, `common`, `rare`, `earlier` oder `later`. `daily` wird intern mit dem täglich rotierenden Fragetyp geführt; öffentlich bleibt der Modus `daily` und `dailyMode` enthält den tatsächlichen Typ. `questionIndex` ist zwingend nötig: Antworten gehören zu genau einer serverseitigen Fragenposition; erneute Übertragung liefert dieselbe gespeicherte Wertung. Eine fremde Antwort-ID wird mit HTTP 400 abgewiesen und verbraucht die Frage nicht. Eine leere `choiceId` ist nur zusammen mit `expired:true` zulässig.

Der Zustand enthält `status: ready | flying | crashed | finished`, `index`, `streak`, `score`, `altitude`, `timeLimitMs`, `deadline`, `question`, `results`, `latestResult`, `crashReason`, `startedAt` und `finishedAt`. `question` ist nur bei laufender Frist vorhanden und enthält keine Werte, Lösung, Erklärung oder Quellen. Abgabeergebnisse ergänzen unter anderem `points`, `altitudeGain`, `correct`, `correctLabel`, `options` mit Vergleichswerten und `source`. Zusätzliche Felder sind `kind`/`flightKind`, `dailyDate`, `dailyMode`, `competitionVersion`, `questionCount`, `completed`, `pilotName`, `answerElapsedMs`, `startAltitude`, `peakAltitude`, `danger`, `correctTotal`, `recovering` und `difficulty`. Die Wertung nennt außerdem `survived`, `rescued`, `altitudeLoss` und `altitudeDelta`.

`results` enthält höchstens die letzten **20 Abgaben** in zeitlicher Reihenfolge. `latestResult` ist die jüngste Auflösung, `resultCount` die Gesamtzahl aller Abgaben dieses Flugs. Die vollständige Historie bleibt in der Datenbank gespeichert; auch nach langen Serien wächst dadurch die Antwortgröße des Spielzustands nicht weiter.

Statistiken zählen alle gestarteten Flüge; `crashes` bezeichnet abgestürzte, `completed` regulär nach zehn Aufgaben beendete Flüge. `bestAltitude` verwendet die Höchstmarke statt der Resthöhe nach Fehlern. `totalCorrect` bleibt unabhängig von zurückgesetzten Serien erhalten. `free` und `daily` trennen beide Flugarten, zusätzlich enthält `byMode.daily` den Tagesflug. `byMode` ist ein Objekt mit Modus-IDs als Schlüsseln. Eine eindeutige Datenbankbedingung auf Flug und Position schützt vor doppelter Belohnung. Ein kurzer persistierter Antwortanspruch hält die erste Wahl und ihren Eingangszeitpunkt fest; ein späterer Abruf kann eine unterbrochene Verarbeitung abschließen. Die vollständige aktive Frage einschließlich Lösung und Zeitfenster liegt nur serverseitig in `runs.question_json`. Sie wird bei Wiederaufnahme und Bewertung nicht neu ausgewählt. Bereits gestartete v1-Fragen werden aus der eingefrorenen alten Fragenbank übernommen und fair aufgelöst; die nächste Aufgabe nutzt die neue Auswahl. Aktive v2-Fragen besitzen bereits ihren vollständigen JSON-Snapshot. Alte v2-Tagesversuche bleiben mit ihrer ursprünglichen Pufferregel erhalten und sperren den betreffenden Tag weiterhin; sie werden nicht nachträglich in die neue Bestenliste übernommen.

## Deployment

### Sites / Cloudflare Worker und D1

`.openai/hosting.json` deklariert die Datenbank als **`"d1": "DB"`**. Der Build bündelt API, Engine, Fakten und öffentliche Assets in `dist/server/index.js`. Er kopiert das Hostingmanifest und die Drizzle-Dateien nach `dist/` sowie `dist/server/drizzle/`.

Ein Veröffentlichungsarchiv aus dem Projektverzeichnis enthält `.openai/`, `dist/` und **`drizzle/` am Archivroot**. Dessen SQL und `meta/_journal.json` müssen mitgeliefert werden, damit Sites das Schema bei der Veröffentlichung anwenden kann. Nach dem Deployment müssen die native Datenbankübersicht `runs` und `answers` sowie eine vollständige Live-Spielrunde geprüft werden. Ein erfolgreicher Worker-Upload allein belegt keine angewendete Migration.

Schemaänderungen als neue Migration mit neuem Journaleintrag ergänzen und angewendete Dateien unverändert lassen. Lokale Migrationen werden beim Node-Start einmalig in Dateireihenfolge angewendet und in `__local_migrations` vermerkt. Die ursprüngliche Migration bleibt unverändert; die additive v2-Migration erhält alte Flüge, Antworten und Rekorde. Keine Tabellen während Spielrequests erstellen oder ändern.

### Eigenständiger Node-Server

Auf einem VPS, Render, Fly.io, Railway oder einem vergleichbaren Dienst Node 22.13+ verwenden, `npm start` ausführen und einen **dauerhaften Datenträger** an `DIVE_DATA_DIR` anbinden. HTTPS über Hoster oder Reverse Proxy bereitstellen. Die lokale SQLite-Variante ist für eine einzelne schreibende Serverinstanz vorgesehen; mehrere Instanzen benötigen einen gemeinsamen Speicheradapter.

### Vercel / Netlify

Die enthaltenen Konfigurationen bauen das Frontend mit `npm run build:static` nach `dist`. Für das vollständige Spiel `/api/*` an den persistenten Node-Server weiterleiten; kurzlebige Function-Dateisysteme eignen sich nicht für diese SQLite-Datei.

Netlify: Vor der vorhandenen SPA-Regel in `netlify.toml` ergänzen und die Domain ersetzen:

```toml
[[redirects]]
  from = "/api/*"
  to = "https://DEINE-API-DOMAIN/api/:splat"
  status = 200
  force = true
```

Vercel: Als ersten `rewrites`-Eintrag in `vercel.json` ergänzen:

```json
{ "source": "/api/:path*", "destination": "https://DEINE-API-DOMAIN/api/:path*" }
```

Danach Wiederaufnahme und erhaltene Rekorde nach einem Neustart des API-Servers prüfen.

## Prüfung und Grenzen

Engine-, API- und Flugszenen-Modultests prüfen Auswahl, Fristen, Wiederaufnahme und Spielregeln. Die API-Prüfung umfasst zwei freie Rettungschancen und dritten Absturz, erfolgreiche Rettung, Berliner Mitternacht, einen verbindlichen Tagesversuch mit zehn gleichen Fragen und 1.500 Metern Startreserve, Tagesrotation, gleichen Fristen trotz unterschiedlicher Antworten, Top-20-Rangfolge und eigenem Rang außerhalb der Liste, Rufnamenprüfung und Löschung, unveränderte alte Rekorde, eingefrorene aktive v1-Fragen, Schutz vor wiederholten Fragenfamilien innerhalb und zwischen freien Flügen, spielergebundene Wiederholungshistorie sowie einen rechtzeitigen Antwortanspruch gegen einen parallelen Ablauf-Abruf.

Der Worker-Smoke-Test nutzt den gebauten Worker mit lokalem SQLite-Adapter und prüft Höhengewinn, Rettung, Tagesflug, Wiederaufnahme, Statistik, Verlauf und Löschung. Dies ist kein visueller Browser- oder 60-fps-Nachweis. Vor öffentlicher Freigabe manuell prüfen:

- Startsequenz, steigende Höhe, Scrollen der Pixel-Wolken und Absturzanimation.
- Alle fünf Modi, vier Antwortmöglichkeiten sowie die Rückmeldung vor dem nächsten vollen Zeitfenster.
- Zwei Rettungschancen, dritte Fehlentscheidung, genau zehn Tagesaufgaben auch bei 0 Metern, positiver Tagesabschluss, Bestenliste, Zeitablauf und Wiederaufnahme ohne neue Frist.
- Tastatur, Touch und 390 Pixel breite Ansicht einschließlich sichtbarer Fokusmarkierung.
- Reduzierte Bewegung, Sound-Schalter, Ergebnis, Quellenlinks und Teilen ohne Lösungsspoiler.

## Inhalte und Erweiterungen

Neue Fragen mit stabiler ID, Typ, eindeutiger richtiger Option, nachvollziehbaren Vergleichswerten und zuverlässiger Quelle in `lib/questions.js` ergänzen. Bei Häufigkeiten Datensatz, Zeitraum und Grundgesamtheit nennen; bei Jahreszahlen oder Messgrößen einheitliche Bezugsbedingungen verwenden. Danach Engine-Tests ausführen. Mögliche Erweiterungen sind Themenflüge, Sprachpakete, redaktionelle Werkzeuge und freiwillige Konten für geräteübergreifende Rekorde.

## Datenschutz und Betrieb

Der Browser speichert unter `hoehenflug-` eine anonyme Gerätekennung, Einstellungen und lokale Flugeinträge. Der Server speichert Kennung, Flüge, Fristen, ausgewählte Antwort-IDs und eingefrorene Wertungen. Die Löschfunktion entfernt zugehörige Backend- und lokale Daten. Eine Gerätekennung ist kein manipulationssicheres Benutzerkonto. Vor öffentlichem Betrieb tatsächliche Betreiber-, Kontakt-, Hosting- und Aufbewahrungsangaben in den rechtlichen Seiten ergänzen und an den vorgesehenen Betrieb anpassen.

## GitHub

Repository-Name: `mathelkprojekt`. GitHub Actions prüft bei Pushes und Pull Requests Tests, Worker-Build und Backend-Smoke-Test mit Node.js 24. Es werden keine API-Schlüssel benötigt. Laufzeitdaten, Datenbanken, Zugangsdaten und die Konfiguration der ursprünglichen Website sind nicht Bestandteil dieses Repositories.
