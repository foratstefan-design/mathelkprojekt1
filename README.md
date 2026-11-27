# mathelkprojekt — Höhenflug

Ein eigenständiges Wissensspiel auf Oberstufenniveau mit einer prozeduralen Pixel-Flugwelt. Interessante Fakten, konkrete Vergleichswerte und kurze Erklärungen verbinden Lernen mit Flugrekorden. Freie Flüge haben keine feste Rundenzahl und zwei Rettungschancen; sie nutzen ausschließlich noch ungesehene Fragen des verfügbaren Katalogs. Im Tagesflug beantworten alle dieselben zehn gemischten Aufgaben: **3 leichte, 4 mittelschwere und 3 schwere**, immer in dieser Reihenfolge. Sie spielen um einen Platz in der Tagesbestenliste. Es werden keine Modellschlüssel benötigt.

Der mitgelieferte Wikidata-Stand enthält **8.834 unabhängige Fragefamilien** mit **10.775 Varianten** aus **14.657 verwendeten Quellfakten**. Der Import enthält 7.854 ursprüngliche freie Familien und 980 Vergleichsfamilien für Tagesflüge. Der Tagesmix reserviert zusätzliche, weltweit noch ungesehene Wissensfamilien aus dem freien Bestand und sperrt sie ab dann für alle freien Flüge. Gegenteilige Vergleichsrichtungen gehören derselben Familie und werden pro Browser nicht als neue Frage wiederholt. Der Katalog ist endlich; ausgeschöpfte Kurse stoppen, statt alte Fakten erneut auszuspielen.

Die erste Ergänzung umfasst **270 eigenständig formulierte Schulfragen**: je 30 in **Mathematik, Physik, Informatik, Biologie, Chemie, Erdkunde, Deutsch, Geschichte sowie Politik & Wirtschaft**, jeweils zehn pro Schwierigkeitsstufe. Eine weitere Erweiterung ergänzt Schulfragen einschließlich **Englisch** sowie **Literatur, Musik, Religionen und Weltanschauungen, Kunst, Sport und Alltagswissenschaft**. Die leichten Fragen prüfen vertraute Grundlagen, die schweren stärker das Verstehen und Anwenden. Alle besitzen vier Antwortmöglichkeiten, eine nachvollziehbare Lösung, eine kurze Erklärung und einen fachlichen Quellenlink. Schulfragen sind als `basis: school`, weitere redaktionelle Wissensfragen als `basis: curated` gekennzeichnet; beide werden nicht als importierte Wikidata-Fakten ausgegeben. Religionen werden neutral und vergleichend behandelt. Die zweite Erweiterung umfasst **315 neue Fragen**. Insgesamt sind **585 eigene Fragen** (360 Schulfragen und 225 weitere Wissensfragen) sowie die Wikidata-Inhalte enthalten: **9.419 unabhängige Fragefamilien und 11.360 Aufgabenvarianten**. Den überprüfbaren Umfang dokumentiert `content/catalog-report.json`.

## Lokal starten

Node.js **22.13 oder neuer**, empfohlen Node 24. Keine npm-Pakete erforderlich.

```sh
git clone https://github.com/foratstefan-design/mathelkprojekt1.git mathelkprojekt
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

Der aktive Fragenbestand liegt in einer SQLite-/D1-Datenbank und verbindet importierte Wikidata-Fakten mit dem eigenen Schulfragenbestand. Die tatsächlich erzeugten Fragen, unabhängigen Fragefamilien und Quellenstände stehen in `content/catalog-report.json`; die laufende Website gibt ihren installierten Bestand über `GET /api/catalog` aus. Aufgabenvarianten derselben Faktenfamilie werden bei der Zählung getrennt von unterschiedlichen Familien angegeben. Jede Auflösung enthält die Datengrundlage, Quellen und eine kurze Erklärung. Diese Lernkarte bleibt ohne laufenden Timer sichtbar, bis „Weiterfliegen“ gewählt wird.

- **Freier Flug:** Gemischt, größter oder kleinster Wert, früheres oder späteres Ereignis. Neue Flüge starten bei 0 Metern. Ein gespeicherter Flug wird ausdrücklich über seine Kennung fortgesetzt.
- Der erste Fehler oder Zeitablauf kostet bis zu **250 Meter**, der zweite in Folge bis zu **400 Meter**. Beide Male geht der Flug weiter, auch bei 0 Metern. Der **dritte Fehler in Folge** endet am Boden. Eine richtige Antwort rettet den Flug und setzt die Gefahr wieder auf 0.
- **Tagesflug:** Ein Versuch pro Gerätekennung und Kalendertag in **Europe/Berlin**. Um **00:00 Uhr Berliner Zeit** beginnt der neue Tag. Jeder neue Tagesflug mischt Schulfächer und weitere Wissensbereiche. Die Reihenfolge ist verbindlich: **Fragen 1–3 leicht, Fragen 4–7 mittelschwer, Fragen 8–10 schwer**. Kuratierte Schul- und Wissensfragen aus unterschiedlichen Bereichen werden bevorzugt; Mengen- und Zeitvergleiche können den Mix ergänzen. Alle erhalten dieselben **zehn Fragen in derselben Reihenfolge** und dieselben Zeitfenster. Der vollständige Tagesfragensatz wird beim ersten Start unveränderlich in `daily_challenges` gespeichert; auch spätere Inhalts-Deployments würfeln laufende Tageswettbewerbe nicht neu. Bereits festgelegte frühere Tagesrunden behalten ihren bisherigen Kurs und ihre Fragen; der Mix gilt für neu angelegte Runden. Der Tagesflug startet bei **1.500 Metern**; jede falsche oder abgelaufene Antwort kostet bis zu **350 Meter**, mindestens bleibt 0. Auch dort werden alle zehn Aufgaben gespielt. Erst die zehnte Antwort beendet ihn mit `status: finished`. Ein gestarteter Versuch wird fortgesetzt und kann am selben Tag nicht neu ausgewürfelt werden. Auf ausdrücklichen Betreiberwunsch wurde der **25.11.2026 einmalig neu gestartet**: Die ursprüngliche Runde bleibt archiviert, während Revision 1 einen neuen gemischten Zehnersatz und genau einen frischen Versuch pro Gerät bietet. Die aktuelle Bestenliste vergleicht ausschließlich diese neue Revision. Am **26.11.2026** führte Revision 1 zunächst die Staffelung 3/2/5 ein. Die anschließende gewünschte Anpassung auf **3/4/3** startet für denselben Tag **Revision 2**. Beide vorherigen Runden dieses Tages bleiben archiviert; Revision 2 gibt jedem Gerät genau einen frischen Versuch und eine gemeinsame, getrennte Bestenliste. Ein erneutes Deployment erzeugt keinen weiteren Neustart. Die fest eingetragenen Daten erzeugen an späteren Tagen keine zusätzlichen Neustarts.
- **Tagesbestenliste:** Nur vollständig beendete Tagesflüge des neuen Formats werden gewertet. Die Reihenfolge richtet sich nach der **Endhöhe**, dann Punkten, kürzerer aufsummierter Antwortzeit, früherem Start und einer stabilen Kennung. Die höchsten 20 Plätze und der eigene Platz werden angezeigt. Ein optionaler Rufname ist veränderbar; ohne Eingabe erscheint ein automatisch erzeugter Name. Es gibt weiterhin keine Anmeldung, daher gilt der Tagesversuch pro Browser-Gerätekennung, nicht geräteübergreifend pro Person.
- Die ersten **16 Aufgaben in den einzelnen freien Kursen** bevorzugen den Einstieg. Im freien **Mix** werden die letzten drei Themenbereiche ausgelassen, solange andere ungesehene Fragen vorhanden sind. Länder, Flächen, Meereshöhen, Längen und Bauwerkshöhen gelten für diesen Wechsel gemeinsam als Geografie. Eine Vertiefung aus Film, Literatur oder Kultur erhält Vorrang vor einer erneuten leichten Geografiefrage; Challenge-Fragen bleiben bis zur Freischaltung der letzte Ausweichbestand. Vertiefung wird frühestens ab Frage 17 und **6.000 Metern Höhengewinn** bevorzugt, Challenge frühestens ab Frage 33 und **14.000 Metern**. Beide Bedingungen müssen erfüllt sein. Neue Tagesfragensätze verwenden **genau drei leichte, vier mittelschwere und drei schwere Fragen**. Die Stufen werden nicht durch andere Schwierigkeiten ersetzt. Fehlt eine benötigte Stufe, wird kein neuer Tagesversuch verbraucht. Die feste Auswahl hängt nicht von der Spielerleistung ab; bereits gespeicherte Tagesfragensätze bleiben unverändert.
- **Dauerhafter Wiederholungsschutz:** Sobald eine neue Frage scharfgeschaltet wird, reserviert der Server ihre Faktenfamilie für die Gerätekennung in `seen_questions`. Auch unbeantwortetes Verlassen verbraucht diese neue Frage. Die vollständige Historie gilt über freie Flüge und Modi hinweg; umgekehrte Vergleichsvarianten gehören derselben Familie an. Bereits vorhandene Antworten und aktive Frage-Snapshots werden in diese Historie übernommen. Eine Wiederaufnahme zeigt dieselbe begonnene Frage mit ihrer bisherigen Frist; sie wählt keine neue Frage aus.
- **Geschützter Tagesbestand:** Der Tagesmix bevorzugt neue Schulfragen und verschiedene Fächer. Wissen, Mengenvergleiche und Zeitfragen sind Auswahlpräferenzen; eine feste Typenquote verdrängt keine passende Schulfrage. Innerhalb der verbindlichen Stufenfolge bevorzugt die Auswahl höchstens zwei Aufgaben desselben Themenbereichs und vermeidet benachbarte gleiche Themen. Die Reihenfolge wird anschließend nicht über Stufengrenzen hinweg gemischt. Zusätzliche Wissensfamilien werden nur reserviert, wenn sie weltweit noch niemandem gezeigt wurden; ab ihrer Tagesreservierung sind sie in allen freien Flügen gesperrt. Die Reservierung prüft beide Richtungen atomar, auch bei gleichzeitigen Anfragen. Tagesfamilien werden über alle Flugtage hinweg eindeutig reserviert. Alle Spieler desselben Tages erhalten weiterhin denselben unveränderlichen Zehnersatz.
- **Kein Recycling bei leerem Katalog:** Gibt es für einen Kurs keine neue passende Frage mehr, erhält der Flug `status: exhausted` und `poolExhausted: true`. Höhe und Rekord bleiben erhalten. Die Oberfläche zeigt einen ruhigen Bestandsabschluss und bietet die Kurswahl an; sie erzeugt dafür weder alte Fragen noch neue Zufallszahlenvarianten. Fehlt eine der für 3/4/3 benötigten neuen Fragen, wird kein neuer Tagesversuch verbraucht. Ein endlicher Katalog wird durch neue importierte Inhalte erweitert, nicht durch Wiederholungen. Browserdaten- oder Spieldatenlöschung setzt die Gerätezuordnung und ihre Historie zurück.
- Neue Tagesfragensätze geben für jede Frage konstant **25 Sekunden**. Bereits gespeicherte Tageswettbewerbe behalten ihre früheren Fristen von 20 Sekunden minus 250 ms je Fragenposition sowie ihre unveränderten Fragen; alle Spieler desselben Wettbewerbs bleiben vergleichbar. Freie Flüge starten mit **22 Sekunden**. Jede insgesamt richtige Antwort verkürzt das nächste Fenster um **200 ms**, bis mindestens **8 Sekunden** bleiben. Fehler setzen diesen Fortschritt nicht zurück. Im Rettungsfenster bleiben **65 %** der normalen Zeit, mindestens **6 Sekunden**. Bereits scharfgeschaltete Fragen behalten immer ihren gespeicherten Zeitrahmen.
- Nach der Abgabe zeigt eine freie Himmelsansicht den Steigflug, den rettbaren Sinkflug oder den vollständigen Absturz mit Bodenkontakt. Während der Rettungsphase wackelt das Flugzeug sichtbar über der Frage; die richtige Antwort richtet es weich auf. Erst nach der Bewegung erscheint die Lernkarte. Die nächste Frage wird dabei noch nicht scharfgeschaltet; bei reduzierter Bewegung erscheinen feste Endzustände ohne Kamerafahrt. Die Rückmeldung zwischen zwei Aufgaben ist untimed. Erst `/api/next` friert die konkrete nächste Frage ein und startet ihre volle Frist. Vorher bleiben die Antwortmöglichkeiten verborgen.
- Eine richtige Antwort gibt **10–30 Punkte** nach Antwortgeschwindigkeit und **150–500 Meter** nach Geschwindigkeit und Serienbonus. Die Höchstmarke bleibt auch nach Höhenverlust gespeichert.
- Die erste gespeicherte Wahl pro Fragenposition ist verbindlich. Wiederholungen liefern dieselbe Wertung. Automatischer Ablauf mit `expired:true` gibt 0 Punkte; manuell abgeschickte Antworten erhalten 500 ms Netzwerklatenz-Toleranz.
- Eine aktive Frist läuft beim Verlassen des Tabs weiter. Wiederaufnahme, Statistik oder Abruf verbuchen einen abgelaufenen unbeantworteten Versuch genau einmal. Die Folgefrage beginnt erst nach ausdrücklichem Weiterflug.

Der freie Flug hat keine feste Gesamtdauer und kein festes Höhenziel. Höhe ist der aktuelle Stand, `peakAltitude` die erreichte Höchstmarke, `streak` die aktuelle richtige Serie und `correctTotal` die Gesamtzahl richtiger Antworten.

## Struktur

```text
public/
  index.html              Oberfläche und Navigation
  app.js                  Auswahl, Timer, Flugzustand und Ergebnisse
  viewport.js             Lesbare Cockpitdichte nach sichtbarer Bildschirmhöhe
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
  catalog.js              Katalogauswahl und dauerhafte Fragenreservierung
  catalog-import.js       Geschützter, atomarer Datenimport über feste Tabellen
  local-catalog-seed.js    Lokaler Datenimport nach den Schema-Migrationen
migrations/
  0001_initial.sql        Unverändertes ursprüngliches Node-Schema
  0002_v2.sql             Additive Felder für Tagesflug, Gefahr und Frage-Snapshot
  0003_daily_competition.sql Zehn-Fragen-Wertung, Tagesfragensatz, Antwortdauer und Rufnamen
  0004_question_catalog.sql Katalog, gesehene Faktenfamilien und Tagesreservierungen
  weitere SQL-Dateien     Ausschließlich additive Schemaänderungen
drizzle/
  0000_initial.sql        Unverändertes ursprüngliches D1-Schema
  0001_v2.sql             Additive v2-Migration; kein Löschen bestehender Daten
  0002_daily_competition.sql Additive Tageswettbewerb-Migration
  meta/_journal.json     Journal der D1-Migrationen
scripts/
  build.mjs               Abhängigkeitsfreier Worker-Build
  build-static.mjs        Frontend-Build für andere Hoster
  smoke-worker.mjs        Prüfung des gebauten Workers mit SQLite-Adapter
  import-wikidata-dump.mjs Offiziellen Wikidata-Dump begrenzt abrufen
  extract-wikidata-dump.py Fakten aus vollständigen Dump-Einträgen lesen
  import-wikidata.mjs     Alternativer SPARQL-Import
  build-catalog.mjs       Katalog, Bericht und Importpakete aus Quellen erzeugen
  upload-catalog.mjs      Serverbestand über den geschützten Import aktualisieren
content/
  wikidata/               Importdaten und Herkunftsnachweise
  question-groups.json    Erzeugte Fragen und Faktenfamilien
  catalog-report.json     Tatsächlicher Umfang und Qualitätsprüfungen
  catalog-import.jsonl    Reproduzierbare Datenpakete, getrennt vom Schema
  school-stem.json        90 Schulfragen: Mathematik, Physik und Informatik
  school-nature.json      90 Schulfragen: Biologie, Chemie und Erdkunde
  school-humanities.json  90 Schulfragen: Deutsch, Geschichte, Politik & Wirtschaft
  school-extra.json       Zusätzliche Schulfragen einschließlich Englisch
  culture-literature-music.json  Literatur- und Musikfragen
  culture-beliefs.json    Religionen und Weltanschauungen
  culture-everyday.json   Kunst, Sport und Alltagswissenschaft
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
| GET `/api/catalog` | – | Installierte Fragen-/Familienzahlen und Quellenstand, ohne Lösungen |
| GET `/api/daily` | – | Berliner Datum, Tagesmodus, zehn Aufgaben, Profil und vorhandener Versuch |
| GET `/api/leaderboard?date=YYYY-MM-DD` | – | Top 20, eigener vollständiger Rang und Zahl beendeter Tagesflüge |
| GET `/api/profile` | – | Gespeicherter oder automatisch erzeugter Rufname |
| POST `/api/profile` | `{name}` | Rufname mit 2–20 Zeichen speichern |
| POST `/api/next` | `{runId}` | Aktuelle Frage mit laufendem Timer |
| POST `/api/answer` | `{runId, questionId, questionIndex, choiceId, expired?}` | Gespeicherte Wahl, Belohnung oder Absturz |
| GET `/api/run?id=…` | Flugkennung | Wiederaufnahme samt letzter Auflösung |
| GET `/api/stats` | – | Rekorde, Serien, Gesamtzahl und `byMode` |
| GET `/api/history` | – | Letzte 20 beendete Flüge |
| POST `/api/delete` | – | Zugeordnete Flug-, Antwort- und Wiederholungsdaten löschen |

`mode` ist `daily`, `mix`, `common`, `rare`, `earlier` oder `later`. Ein neuer Tagesflug hat öffentlich `mode: daily` und `dailyMode: mix`. Die zehn Aufgaben folgen den Schwierigkeitsstufen `[1,1,1,2,2,2,2,3,3,3]` und mischen verschiedene Fächer. Die Tagesübersicht liefert die lösungsfreie `difficultyPlan` und das Merkmal `progressiveDaily`; gespeicherte frühere Runden behalten ihren tatsächlichen Plan. Bereits festgelegte ältere Tagesflüge behalten ihren gespeicherten `dailyMode` und ihre unveränderte Auswahl. `questionIndex` ist zwingend nötig: Antworten gehören zu genau einer serverseitigen Fragenposition; erneute Übertragung liefert dieselbe gespeicherte Wertung. Eine fremde Antwort-ID wird mit HTTP 400 abgewiesen und verbraucht die Frage nicht. Eine leere `choiceId` ist nur zusammen mit `expired:true` zulässig.

Der Zustand enthält `status: ready | flying | crashed | finished | exhausted`, `index`, `streak`, `score`, `altitude`, `timeLimitMs`, `deadline`, `question`, `results`, `latestResult`, `crashReason`, `startedAt` und `finishedAt`. `question` ist nur bei laufender Frist vorhanden und enthält keine Werte, Lösung, Erklärung oder Quellen. Abgabeergebnisse ergänzen unter anderem `points`, `altitudeGain`, `correct`, `correctLabel`, `options` mit Vergleichswerten und `source`. Zusätzliche Felder sind `dailyRevision`, `dailySuperseded`, `replacementMessage`, `kind`/`flightKind`, `dailyDate`, `dailyMode`, `competitionVersion`, `questionCount`, `completed`, `pilotName`, `answerElapsedMs`, `startAltitude`, `peakAltitude`, `danger`, `correctTotal`, `recovering` und `difficulty`. Ein ausgeschöpfter Bestand wird zusätzlich durch `poolExhausted` gekennzeichnet. Die Wertung nennt außerdem `survived`, `rescued`, `altitudeLoss` und `altitudeDelta`.

`results` enthält höchstens die letzten **20 Abgaben** in zeitlicher Reihenfolge. `latestResult` ist die jüngste Auflösung, `resultCount` die Gesamtzahl aller Abgaben dieses Flugs. Die vollständige Historie bleibt in der Datenbank gespeichert; auch nach langen Serien wächst dadurch die Antwortgröße des Spielzustands nicht weiter.

Statistiken zählen alle gestarteten Flüge; `crashes` bezeichnet abgestürzte, `completed` regulär nach zehn Aufgaben beendete Flüge. `bestAltitude` verwendet die Höchstmarke statt der Resthöhe nach Fehlern. `totalCorrect` bleibt unabhängig von zurückgesetzten Serien erhalten. `free` und `daily` trennen beide Flugarten, zusätzlich enthält `byMode.daily` den Tagesflug. `byMode` ist ein Objekt mit Modus-IDs als Schlüsseln. Eine eindeutige Datenbankbedingung auf Flug und Position schützt vor doppelter Belohnung. Ein kurzer persistierter Antwortanspruch hält die erste Wahl und ihren Eingangszeitpunkt fest; ein späterer Abruf kann eine unterbrochene Verarbeitung abschließen. Die vollständige aktive Frage einschließlich Lösung und Zeitfenster liegt nur serverseitig in `runs.question_json`. Sie wird bei Wiederaufnahme und Bewertung nicht neu ausgewählt. Bereits gestartete v1-Fragen werden aus der eingefrorenen alten Fragenbank übernommen und fair aufgelöst; die nächste Aufgabe nutzt die neue Auswahl. Aktive v2-Fragen besitzen bereits ihren vollständigen JSON-Snapshot. Alte v2-Tagesversuche bleiben mit ihrer ursprünglichen Pufferregel erhalten und sperren den betreffenden Tag weiterhin; sie werden nicht nachträglich in die neue Bestenliste übernommen.

## Deployment

### GitHub Pages

Der Workflow `.github/workflows/pages.yml` prüft das Spiel und veröffentlicht bei jedem Push auf `main` die Browseroberfläche auf GitHub Pages. Einmalig in **Settings → Pages → Build and deployment → Source** die Option **GitHub Actions** wählen. Falls der erste Lauf vorher schon fehlgeschlagen ist, unter **Actions → Publish game on GitHub Pages → Run workflow** erneut starten.

Nach der Aktivierung ist der teilbare Spiellink **https://foratstefan-design.github.io/mathelkprojekt1/**. Die Seite lädt direkt von GitHub; ihre öffentliche API liegt unter `https://hoehenflug.courteousclay.chatgpt.site`. GitHub Pages führt selbst keinen Node-Server und keine SQLite-Datenbank aus. Tagesrunden, Bestenliste, Fragenbestand und Wiederholungsschutz verwenden deshalb weiterhin den bestehenden Server. Es werden keine Lösungen, Datenbankdateien oder Zugangsdaten in das Pages-Artefakt kopiert.

Der Pages-Build setzt `GAME_API_ORIGIN`; `public/runtime-config.js` verwendet ohne diese Build-Einstellung dieselbe Domain wie das Frontend. API-Zugriff aus dem Browser ist für die exakte Herkunft `https://foratstefan-design.github.io` freigegeben. Für einen Fork sind Workflow und erlaubte Herkunft entsprechend anzupassen. Relative Asset-Links und Ergebnislinks funktionieren auch unter dem Repository-Unterpfad.

Die GitHub-Adresse und die bisherige Spieladresse haben getrennten Browserspeicher. Vorhandene lokale Gerätekennungen und Rekorde werden beim Wechsel der Adresse nicht automatisch übernommen; der alte Spielstand bleibt an der bisherigen Adresse erreichbar.

### Sites / Cloudflare Worker und D1

`.openai/hosting.json` deklariert die Datenbank als **`"d1": "DB"`**. Der Build bündelt API, Engine und öffentliche Assets in `dist/server/index.js`. Der große Katalog liegt in D1 statt im Browser-Bundle. Das vertrauenswürdige Paket redaktioneller Schul- und Wissensfragen wird mit dem Worker veröffentlicht und vor der ersten Spielanfrage idempotent in die Datenbank übernommen. Ein Versionsmarker verhindert einen erneuten Import unveränderter Inhalte; unterbrochene Übernahmen sind wiederholbar. Es werden dabei keine bestehenden Flüge, Tages-Snapshots oder Wiederholungseinträge gelöscht. Das Pages-Artefakt enthält weiterhin keine Lösungen oder Quelldaten. Der Build kopiert das Hostingmanifest und die Drizzle-Dateien nach `dist/` sowie `dist/server/drizzle/`.

Ein Veröffentlichungsarchiv aus dem Projektverzeichnis enthält `.openai/`, `dist/` und **`drizzle/` am Archivroot**. Dessen SQL und `meta/_journal.json` müssen mitgeliefert werden, damit Sites das Schema bei der Veröffentlichung anwenden kann. Nach dem Deployment müssen die native Datenbankübersicht `runs` und `answers` sowie eine vollständige Live-Spielrunde geprüft werden. Ein erfolgreicher Worker-Upload allein belegt keine angewendete Migration.

Schemaänderungen als neue Migration mit neuem Journaleintrag ergänzen und angewendete Dateien unverändert lassen. Lokale Migrationen werden beim Node-Start einmalig in Dateireihenfolge angewendet und in `__local_migrations` vermerkt. Die ursprüngliche Migration bleibt unverändert; die additive v2-Migration erhält alte Flüge, Antworten und Rekorde. Keine Tabellen während Spielrequests erstellen oder ändern.

Katalogdaten gehören **nicht in Schema-Migrationen**. Lokal lädt der Server `content/catalog-import.jsonl` nach den Migrationen und überspringt unveränderte Versionen. Für Sites in den Laufzeiteinstellungen ein langes zufälliges `CATALOG_IMPORT_TOKEN` als Secret setzen und mit dem Worker veröffentlichen. Anschließend `node --use-env-proxy scripts/upload-catalog.mjs https://DEINE-SPIELDOMAIN` starten und das Token verdeckt über die Standardeingabe übergeben. Es gehört weder ins Repository noch in eine URL. Ohne konfiguriertes Secret bleibt die Import-Route abgeschaltet. Der Import verwendet feste Tabellennamen, validierte gebundene Werte und atomare Pakete; ein abgebrochener Upload kann wiederholt werden. Erst nach allen Paketen wird die neue Katalogversion gesetzt. Die öffentliche API liefert keine Lösungen vor der Abgabe.

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

Engine-, API- und Flugszenen-Modultests prüfen Auswahl, Fristen, Wiederaufnahme und Spielregeln. Die API-Prüfung umfasst zwei freie Rettungschancen und dritten Absturz, erfolgreiche Rettung, Berliner Mitternacht, einen verbindlichen Tagesversuch mit zehn gleichen Fragen und 1.500 Metern Startreserve, gemischte Tagesauswahl, gleichen Fristen trotz unterschiedlicher Antworten, Top-20-Rangfolge und eigenem Rang außerhalb der Liste, Rufnamenprüfung und Löschung, unveränderte alte Rekorde, eingefrorene aktive v1-Fragen, Schutz vor wiederholten Fragenfamilien innerhalb und zwischen freien Flügen, spielergebundene Wiederholungshistorie sowie einen rechtzeitigen Antwortanspruch gegen einen parallelen Ablauf-Abruf.

Der Worker-Smoke-Test nutzt den gebauten Worker mit lokalem SQLite-Adapter und prüft Höhengewinn, Rettung, Tagesflug, Wiederaufnahme, Statistik, Verlauf und Löschung. Dies ist kein visueller Browser- oder 60-fps-Nachweis. Vor öffentlicher Freigabe manuell prüfen:

- Startsequenz, steigende Höhe, Scrollen der Pixel-Wolken und Absturzanimation.
- Alle fünf Modi, vier Antwortmöglichkeiten sowie die Rückmeldung vor dem nächsten vollen Zeitfenster.
- Zwei Rettungschancen, dritte Fehlentscheidung, genau zehn Tagesaufgaben auch bei 0 Metern, positiver Tagesabschluss, Bestenliste, Zeitablauf und Wiederaufnahme ohne neue Frist.
- Tastatur, Touch und 390 Pixel breite Ansicht einschließlich sichtbarer Fokusmarkierung.
- Reduzierte Bewegung, Sound-Schalter, Ergebnis, Quellenlinks und Teilen ohne Lösungsspoiler.

## Inhalte und Erweiterungen

Der Wikidata-Import ist ein redaktioneller Build-Schritt, kein Browser- oder Spielrequest. Die zusätzlich gepflegten Dateien `content/school-*.json` und `content/culture-*.json` enthalten eigenständige Frageformulierungen und Quellenverweise. Ihr Build erhält stabile Faktenfamilien und verhindert doppelte sichtbare Fragen; andere Zahlen für denselben Sachverhalt werden nicht als zusätzliche Wissensfragen gezählt. Die verlinkten Lehrtexte dienen der fachlichen Begründung und werden nicht als fremde Fragetexte kopiert. Der mitgelieferte Bestand stammt aus einem begrenzten 128-MiB-Ausschnitt des offiziellen JSON-Dumps. Der Import liest nur vollständige Einträge und dokumentiert Dump-Adresse, ETag, Abrufzeit, Bytebereiche, SHA-256 und Entitätsrevisionen in `content/wikidata/dump-manifest.json`. Der gespeicherte Faktenschnappschuss erlaubt einen erneuten Datenbank-Build ohne Netzwerk. Für einen neuen Dump-Import wird zusätzlich Python 3 mit seiner Standardbibliothek benötigt; zum Spielen und Bauen reicht Node.js. Die Offline-Parserprüfung benötigt ebenfalls Python 3. Der gespeicherte Datenstand hält Entitätskennungen, Eigenschaften, Quellen und Abrufinformationen fest. Wikidata stellt seine strukturierten Daten unter [CC0](https://www.wikidata.org/wiki/Wikidata:Licensing) bereit; die Spielgrafiken und der Programmcode haben dadurch keine andere Lizenz.

```sh
npm run questions:import             # offizieller Dump; begrenzter Download, fortsetzbarer Cache
npm run questions:build              # Datenpakete aus dem gespeicherten Faktenstand
npm test
```

Der Compiler verwirft mehrdeutige oder unvollständige Datensätze und führt Faktenfamilien unabhängig vom Fragetext zusammen. Fragenvarianten mit demselben Fakt erhalten dieselbe Familie. Vergleiche nutzen dieselbe Eigenschaft, Einheiten und passende Gegenstandsgruppen – etwa Flüsse mit Flüssen. Körpergrößen werden nicht als Bauwerkshöhen verwendet; kommunale Eingemeindungsdaten gelten nicht als ursprüngliche Stadtgründung. Veröffentlichungsdaten verwenden das früheste gültige erfasste Jahr statt einer späteren bevorzugten Neuauflage. Wikidata-Verlinkungszahlen dienen nur als grober Hinweis für die Schwierigkeit und gelten nicht als reale Nutzungshäufigkeit. Bestehende Gruppenzuordnungen in `content/question-groups.json` bleiben bei Erweiterungen erhalten. Neue Importpakete werden separat geladen; angewendete Schema-Migrationen und veröffentlichte Tagesfragensätze bleiben unverändert. `questions:import:sparql` ist ein alternativer Importweg; große SPARQL-Abfragen können wegen Zeitüberschreitung scheitern. Nach einem Import den Bericht `content/catalog-report.json`, Stichproben der Auflösungen sowie die Katalog- und API-Tests prüfen. Der automatische Import ersetzt keine vollständige redaktionelle Faktenprüfung.

Weitere Erweiterungen können Themenflüge, Sprachpakete und freiwillige Konten für geräteübergreifende Historien sein.

## Datenschutz und Betrieb

Der Browser speichert unter `hoehenflug-` eine anonyme Gerätekennung, Einstellungen und lokale Flugeinträge. Der Server speichert Kennung, Flüge, Fristen, ausgewählte Antwort-IDs, eingefrorene Wertungen und gesehene Faktenfamilien. Die Löschfunktion entfernt zugehörige Backend- und lokale Daten einschließlich der persönlichen Wiederholungshistorie. Danach können zuvor gesehene Fakten erneut ausgewählt werden. Eine Gerätekennung ist kein manipulationssicheres Benutzerkonto. Vor öffentlichem Betrieb tatsächliche Betreiber-, Kontakt-, Hosting- und Aufbewahrungsangaben in den rechtlichen Seiten ergänzen und an den vorgesehenen Betrieb anpassen.

## GitHub

GitHub-Repository: [foratstefan-design/mathelkprojekt1](https://github.com/foratstefan-design/mathelkprojekt1). Projektname: `mathelkprojekt`. GitHub Actions prüft bei Pushes und Pull Requests Tests, Worker-Build und Backend-Smoke-Test mit Node.js 24. Es werden keine API-Schlüssel benötigt. Laufzeitdaten, Datenbanken, Zugangsdaten und die Konfiguration der ursprünglichen Website sind nicht Bestandteil dieses Repositories.


## Kompaktes Cockpit und Reaktionszeit

Die aktive Frage nutzt die sichtbare Browserhöhe (`visualViewport` auf iPad/Safari) und bis zu drei Abstandsstufen. Frage, vier Antworten und Timer bleiben auf typischen Tablet-Ansichten gemeinsam sichtbar; Antworten bleiben mindestens 16 CSS-Pixel groß. Extrem lange Texte und vergrößerte Schrift dürfen weiterhin natürlich scrollen. Größenwechsel ändern weder die Aufgabe noch ihre Frist. Lernkarten sind absichtlich ohne Zeitdruck scrollbar.

Die gewählte Antwort und der Weiterflug zeigen sofort einen Übertragungszustand. Der Countdown schreibt seine Zehntelsekunden höchstens zehnmal pro Sekunde ins DOM. Die Canvas-Zeichenfläche verwendet höchstens DPR 1,5; kompilierte Sprite-Zeilen und zwischengespeicherte Himmelsfarben reduzieren Zeichenarbeit. Reduced Motion und alle Steig-, Rettungs- und Absturzphasen bleiben erhalten.

Backend-Leseergebnisse werden ausschließlich innerhalb einer Anfrage wiederverwendet. Im warmen lokalen Test benötigt `/api/next` statt 21 nun 13 SQL-Aufrufe im freien Flug und statt 19 nun 12 im Tagesflug (Auswahlgrenzen können zusätzliche Abfragen erfordern). Die erlaubte GitHub-Pages-Herkunft darf die CORS-Vorabfreigabe 600 Sekunden wiederverwenden. Antworten und Spielstände werden weiterhin nicht öffentlich zwischengespeichert; die erste Antwort wird vor weiteren Datenbank-Lesezugriffen atomar gespeichert. Die tatsächliche Wartezeit hängt weiterhin von Netzwerk und Hosting ab.
