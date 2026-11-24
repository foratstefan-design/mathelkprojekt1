// Oberstufenwissen: Jede Aufgabe erklärt einen Zusammenhang statt bloß eine Zahl.
// Quellen beziehen sich auf den konkret erklärten Sachverhalt; Antwortreihenfolgen
// werden zusätzlich durch die Engine für jeden Flug stabil gemischt.
const catalog = [];
function fact(id, difficulty, category, prompt, answers, explanation, title, url) {
  const correct = answers[0];
  const offset = (catalog.length * 3 + 1) % 4;
  const labels = [...answers.slice(offset), ...answers.slice(0, offset)];
  const questionId = 'mss-general-' + id;
  const options = labels.map((label, index) => ({
    id: questionId + '-o' + (index + 1), label, value: index,
    displayValue: label === correct ? 'Richtig' : 'Nicht zutreffend'
  }));
  catalog.push({ id: questionId, familyId: questionId, type: 'general', difficulty,
    category, prompt, options, correctId: options.find(option => option.label === correct).id,
    explanation, source: { title, url }, basis: 'curated', basisLabel: 'Wissen und Zusammenhänge · Oberstufe' });
}

// Bekanntes Wissen mit einem interessanten, oft missverstandenen Grund.
fact('antibiotika', 1, 'Medizin',
  'Warum helfen Antibiotika nicht gegen eine reine Virusinfektion?',
  ['Sie greifen bakterielle Strukturen oder Prozesse an.', 'Viren sind lediglich besonders große Bakterien.', 'Viren besitzen eine undurchdringliche Zellwand.', 'Antibiotika wirken ausschließlich im Blut.'],
  'Viele Antibiotika greifen etwa den Aufbau bakterieller Zellwände oder die bakterielle Proteinsynthese an. Viren besitzen diese Angriffspunkte nicht; unnötiger Antibiotikaeinsatz fördert dagegen die Auswahl resistenter Bakterien.',
  'CDC · Antibiotic Do’s and Don’ts', 'https://www.cdc.gov/antibiotic-use/about/');
fact('eis-schwimmt', 1, 'Chemie',
  'Warum schwimmt gewöhnliches Wassereis auf flüssigem Wasser?',
  ['Sein Kristallgitter macht es weniger dicht.', 'Gefrorenes Wasser verliert einen Teil seiner Masse.', 'Eis besteht überwiegend aus eingeschlossener Luft.', 'Die Schwerkraft wirkt nicht auf festes Wasser.'],
  'Wasserstoffbrücken stabilisieren im Eis eine offene Kristallstruktur, die mehr Raum einnimmt als dieselbe Menge flüssigen Wassers. Die geringere Dichte lässt Eis schwimmen und ermöglicht eine isolierende Eisdecke auf Seen.',
  'USGS · Water Density', 'https://www.usgs.gov/water-science-school/science/water-density');
fact('jahreszeiten', 1, 'Astronomie',
  'Was verursacht hauptsächlich die Jahreszeiten auf der Erde?',
  ['Die Neigung der Erdachse gegenüber der Umlaufbahn', 'Die jährlich wechselnde Größe der Sonne', 'Die tägliche Drehung der Erde um ihre Achse', 'Die wechselnde Entfernung des Mondes'],
  'Die geneigte Erdachse verändert im Jahreslauf Sonnenstand und Tageslänge auf jeder Halbkugel. Deshalb ist auf der Südhalbkugel Sommer, wenn auf der Nordhalbkugel Winter ist; die Entfernung zur Sonne erklärt diesen Gegensatz nicht.',
  'NASA · What Causes the Seasons?', 'https://spaceplace.nasa.gov/seasons/en/');
fact('inflation', 1, 'Wirtschaft',
  'Was beschreibt Inflation in einer Volkswirtschaft?',
  ['Einen allgemeinen Anstieg des Preisniveaus', 'Jede einzelne Preiserhöhung eines Produkts', 'Einen allgemeinen Rückgang der Produktion', 'Einen automatischen Anstieg aller Reallöhne'],
  'Inflation beschreibt einen breiten Anstieg von Preisen, nicht nur teureres Benzin oder ein einzelnes Lebensmittel. Steigen die Einkommen langsamer als die Preise, sinkt ihre Kaufkraft.',
  'Europäische Zentralbank · Was ist Inflation?', 'https://www.ecb.europa.eu/ecb-and-you/explainers/tell-me-more/html/what_is_inflation.en.html');
fact('verfassungsgericht', 1, 'Politik',
  'Welche deutsche Institution kann ein Bundesgesetz wegen Verfassungswidrigkeit für nichtig erklären?',
  ['Das Bundesverfassungsgericht', 'Das Statistische Bundesamt', 'Der Europäische Rat', 'Die Bundesbank'],
  'Das Bundesverfassungsgericht kontrolliert staatliches Handeln am Maßstab des Grundgesetzes. Es kann Gesetze für nichtig erklären oder ihre Unvereinbarkeit feststellen und dem Gesetzgeber eine Frist für eine Neuregelung setzen.',
  'Bundesverfassungsgericht · Wirkung der Entscheidungen', 'https://www.bundesverfassungsgericht.de/DE/Entscheidungen/WirkungDerEntscheidungen/wirkungDerEntscheidungen_node.html');
fact('masse-mond', 1, 'Physik',
  'Ein Mensch reist von der Erde auf den Mond. Welche Größe bleibt dabei praktisch gleich?',
  ['Seine Masse', 'Seine Gewichtskraft', 'Die Fallbeschleunigung seiner Umgebung', 'Die Kraft, mit der ihn der Boden im Stand trägt'],
  'Die Masse kennzeichnet unter anderem die Trägheit eines Körpers und hängt nicht vom Aufenthaltsort ab. Die Gewichtskraft ist dagegen Masse mal Fallbeschleunigung und beträgt auf dem Mond nur ungefähr ein Sechstel des irdischen Werts.',
  'OpenStax · Mass and Weight', 'https://openstax.org/books/university-physics-volume-1/pages/5-4-mass-and-weight');
fact('mondphasen', 1, 'Astronomie',
  'Warum sehen wir den Mond im Monatsverlauf als Sichel, Halbmond oder Vollmond?',
  ['Wir sehen unterschiedlich viel seiner sonnenbeleuchteten Hälfte.', 'Der Erdschatten bedeckt den Mond jeden Monat unterschiedlich stark.', 'Der Mond verändert regelmäßig seine Form.', 'Die Sonne beleuchtet den Mond nur an wenigen Tagen.'],
  'Die Sonne beleuchtet stets ungefähr eine Hälfte des Mondes. Beim Umlauf verändert sich unser Blickwinkel auf diese beleuchtete Hälfte; ein Erdschatten verursacht dagegen eine Mondfinsternis.',
  'NASA · Top Moon Questions', 'https://science.nasa.gov/moon/top-moon-questions/');
fact('polarlicht', 1, 'Weltraumwetter',
  'Was bringt die Atmosphäre bei einem Polarlicht zum Leuchten?',
  ['Geladene Teilchen regen Atome und Moleküle der Hochatmosphäre an.', 'Mondlicht wird vom Polareis wie von einem Spiegel reflektiert.', 'Die Ozonschicht entzündet sich durch Reibung.', 'Die Erde sendet an den Polen sichtbare Wärmestrahlung aus.'],
  'Geladene Teilchen können entlang des Erdmagnetfelds in die obere Atmosphäre gelangen und dort Gasteilchen anregen. Bei der Abgabe dieser Energie entsteht Licht, etwa grünes Licht von Sauerstoff.',
  'NOAA · Aurora', 'https://ncc.nesdis.noaa.gov/VIIRS/SWX/Aurora.php');
fact('oktopus-blut', 2, 'Tierbiologie',
  'Welches Metall steckt im sauerstofftransportierenden Hämocyanin, das Oktopusblut blau färbt?',
  ['Kupfer', 'Gold', 'Aluminium', 'Silber'],
  'Oktopusse transportieren Sauerstoff mit kupferhaltigem Hämocyanin, das in gebundener Form blau erscheint. Menschen verwenden stattdessen das eisenhaltige Hämoglobin in roten Blutkörperchen.',
  'Smithsonian Ocean · Cephalopods', 'https://ocean.si.edu/ocean-life/invertebrates/octopuses-squids-and-relatives');
fact('neologismus', 1, 'Sprache',
  'Wie heißt eine sprachliche Neuprägung, die in den allgemeinen Gebrauch übergeht?',
  ['Neologismus', 'Anapher', 'Pleonasmus', 'Euphemismus'],
  'Ein Neologismus kann ein neues Wort oder eine neue Bedeutung eines vorhandenen Wortes sein. Sprache reagiert damit etwa auf technische Entwicklungen und gesellschaftliche Veränderungen.',
  'Duden · Neologismus', 'https://www.duden.de/rechtschreibung/Neologismus');
fact('bip-haushalt', 1, 'Wirtschaft',
  'Welche Leistung bleibt bei der üblichen Berechnung des Bruttoinlandsprodukts weitgehend unberücksichtigt?',
  ['Unbezahlte Kinderbetreuung in der eigenen Familie', 'Eine bezahlte Reparatur in einer Werkstatt', 'Ein verkaufter Haarschnitt im Friseursalon', 'Eine bezahlte Busfahrt'],
  'Unbezahlte Haus- und Sorgearbeit wird in der üblichen BIP-Messung weitgehend nicht erfasst, obwohl sie einen großen wirtschaftlichen Wert hat. Derselbe Betreuungsaufwand kann im BIP auftauchen, sobald eine bezahlte Dienstleistung daraus wird.',
  'U.S. Bureau of Economic Analysis · Household production and GDP', 'https://bea.gov/index.php/help/faq/1297');
fact('erdbeben', 1, 'Geologie',
  'Was löst die meisten tektonischen Erdbeben unmittelbar aus?',
  ['Ein plötzliches Gleiten entlang einer geologischen Störung', 'Eine plötzliche Änderung des Erdmagnetfelds', 'Der gleichmäßige Wechsel von Ebbe und Flut', 'Das tägliche Erwärmen der Erdoberfläche'],
  'An verhakten Gesteinsflächen kann sich durch Plattenbewegungen elastische Spannung aufbauen. Wenn sie plötzlich nachgeben, wird Energie als seismische Wellen freigesetzt.',
  'USGS · What is an earthquake?', 'https://www.usgs.gov/faqs/what-earthquake-and-what-causes-them-happen');

// Oberstufenbegriffe und wissenschaftliches Denken.
fact('photosynthese-sauerstoff', 2, 'Biologie',
  'Aus welchem Ausgangsstoff stammt der bei der pflanzlichen Photosynthese freigesetzte Sauerstoff?',
  ['Aus Wasser', 'Aus Kohlenstoffdioxid', 'Aus Glucose', 'Aus Stickstoff'],
  'Der freigesetzte molekulare Sauerstoff entsteht bei der Spaltung von Wasser am Photosystem II. Kohlenstoffdioxid liefert dagegen den Kohlenstoff für den späteren Aufbau organischer Stoffe.',
  'OpenStax · Light-Dependent Reactions of Photosynthesis', 'https://openstax.org/books/biology-2e/pages/8-2-the-light-dependent-reactions-of-photosynthesis');
fact('mitochondrien-erbe', 1, 'Genetik',
  'Von wem wird die mitochondriale DNA beim Menschen üblicherweise vererbt?',
  ['Von der Mutter', 'Ausschließlich vom Vater', 'Nur vom Großvater väterlicherseits', 'Zu gleichen Teilen aus beiden Zellkernen'],
  'Die Mitochondrien des entstehenden Embryos stammen normalerweise aus der Eizelle. Ihre eigene DNA folgt deshalb einer anderen Vererbungslinie als die DNA des Zellkerns, zu der beide Eltern beitragen.',
  'NIH · The Maternal Magic of Mitochondria', 'https://nigms.nih.gov/biobeat/2020/05/the-maternal-magic-of-mitochondria');
fact('erythrozyten', 2, 'Humanbiologie',
  'Welche Besonderheit haben reife rote Blutkörperchen des Menschen?',
  ['Sie besitzen keinen Zellkern.', 'Sie enthalten den größten Zellkern aller Körperzellen.', 'Sie vermehren sich durch Zellteilung im Blut.', 'Sie transportieren Sauerstoff durch Chlorophyll.'],
  'Reife menschliche Erythrozyten haben ihren Zellkern und auch ihre Mitochondrien verloren. Das schafft Platz für Hämoglobin und verhindert, dass sie den transportierten Sauerstoff selbst durch mitochondriale Zellatmung verbrauchen.',
  'NCBI Bookshelf · Blood and the cells it contains', 'https://www.ncbi.nlm.nih.gov/books/NBK2263/');
fact('ph-logarithmus', 2, 'Chemie',
  'Wie viel größer ist die Oxoniumionen-Konzentration bei pH 3 als bei pH 5 in verdünnter wässriger Lösung?',
  ['Ungefähr 100-mal', 'Ungefähr 2-mal', 'Ungefähr 10-mal', 'Ungefähr 1.000-mal'],
  'Die pH-Skala ist logarithmisch: Eine pH-Stufe entspricht etwa einem Faktor zehn bei der Oxoniumionen-Konzentration. Zwei Stufen Unterschied ergeben deshalb zehn mal zehn, also den Faktor hundert.',
  'OpenStax · pH and pOH', 'https://openstax.org/books/chemistry-2e/pages/14-2-ph-and-poh');
fact('opportunitaetskosten', 2, 'Wirtschaft',
  'Was meint der ökonomische Begriff Opportunitätskosten?',
  ['Den Wert der besten entgangenen Alternative', 'Die Summe sämtlicher denkbarer Alternativen', 'Nur die unmittelbar bezahlte Geldsumme', 'Eine staatliche Steuer auf Gelegenheitskäufe'],
  'Eine Entscheidung kostet nicht nur Geld, sondern auch die nächstbeste Möglichkeit, auf die man verzichtet. Wer einen Abend arbeitet, kann beispielsweise Freizeit aufgeben, auch wenn dafür keine Rechnung ausgestellt wird.',
  'OpenStax · Choices and Opportunity Cost', 'https://openstax.org/books/principles-economics-2e/pages/2-1-how-individuals-make-choices-based-on-their-budget-constraint');
fact('korrelation', 2, 'Statistik',
  'Eisverkauf und Badeunfälle steigen im Sommer gleichzeitig. Was folgt daraus allein noch nicht?',
  ['Dass Eisessen Badeunfälle verursacht', 'Dass beide Größen statistisch zusammenhängen können', 'Dass eine dritte Größe beide beeinflussen könnte', 'Dass Temperatur als weitere Variable untersucht werden kann'],
  'Ein gemeinsamer Einfluss wie warmes Wetter kann beide Größen erhöhen, ohne dass eine die andere verursacht. Eine beobachtete Korrelation allein belegt deshalb keinen ursächlichen Zusammenhang.',
  'Australian Bureau of Statistics · Correlation and causation', 'https://www.abs.gov.au/statistics/understanding-statistics/statistical-terms-and-concepts/correlation-and-causation');
fact('randomisierung', 2, 'Wissenschaft',
  'Warum werden Teilnehmende in einer randomisierten Studie zufällig auf Behandlungsgruppen verteilt?',
  ['Um systematische Unterschiede zwischen den Gruppen zu verringern', 'Damit die Behandlung bei allen sicher wirkt', 'Damit jede Gruppe garantiert exakt dieselben Eigenschaften besitzt', 'Um eine Kontrollgruppe grundsätzlich überflüssig zu machen'],
  'Zufällige Zuteilung verringert die Gefahr, dass bekannte oder unbekannte Störfaktoren die Gruppen systematisch unterscheiden. Sie garantiert keine identischen Gruppen, verbessert aber die Grundlage für einen fairen Wirkungsvergleich.',
  'National Cancer Institute · Randomization', 'https://www.cancer.gov/publications/dictionaries/cancer-terms/def/randomization');
fact('treibhauseffekt', 2, 'Klimaphysik',
  'Wie verstärken Treibhausgase die Erwärmung der unteren Atmosphäre?',
  ['Sie absorbieren und emittieren einen Teil der infraroten Wärmestrahlung.', 'Sie verwandeln direkt sämtliches Sonnenlicht in Sauerstoff.', 'Sie verhindern grundsätzlich jeden Energieaustausch mit dem All.', 'Sie verstärken ausschließlich die UV-Strahlung der Sonne.'],
  'Die Erdoberfläche gibt aufgenommene Energie unter anderem als Infrarotstrahlung ab. Treibhausgase wechselwirken mit bestimmten Wellenlängen und verändern dadurch die Energiebilanz; sie bilden keine vollständig undurchlässige Decke.',
  'NASA · Causes of Climate Change', 'https://science.nasa.gov/climate-change/causes/');
fact('abo-antigene', 2, 'Medizin',
  'Wodurch werden die Blutgruppen A, B, AB und 0 im AB0-System unterschieden?',
  ['Durch bestimmte Oberflächenmerkmale roter Blutkörperchen', 'Durch die Zahl der Herzkammern', 'Durch die Farbe der weißen Blutkörperchen', 'Durch die Menge an Eisen im gesamten Körper'],
  'Die AB0-Gruppen hängen davon ab, welche A- und B-Antigene auf roten Blutkörperchen vorkommen. Gegen fehlende Merkmale können passende Antikörper im Plasma vorhanden sein, was für die Verträglichkeit von Bluttransfusionen entscheidend ist.',
  'NCBI Bookshelf · The ABO blood group', 'https://www.ncbi.nlm.nih.gov/books/NBK2267/');
fact('genetischer-code', 2, 'Genetik',
  'Was bedeutet die Degeneriertheit des genetischen Codes?',
  ['Mehrere verschiedene Codons können dieselbe Aminosäure codieren.', 'Jedes Codon codiert gleichzeitig alle Aminosäuren.', 'Die DNA verliert bei jeder Zellteilung alle Basen.', 'Nur beschädigte Gene besitzen einen genetischen Code.'],
  'Es gibt mehr mögliche Basentripletts als proteinbildende Standardaminosäuren. Daher können unterschiedliche Codons dieselbe Aminosäure bedeuten; manche Basenaustausche verändern folglich die Aminosäuresequenz eines Proteins nicht.',
  'OpenStax · The Genetic Code', 'https://openstax.org/books/biology-2e/pages/15-1-the-genetic-code');
fact('doppler', 2, 'Akustik',
  'Warum klingt die Sirene eines sich nähernden Krankenwagens höher als nach dem Vorbeifahren?',
  ['Die Bewegung verändert die beim Beobachter ankommende Frequenz.', 'Die Sirene schaltet beim Vorbeifahren zwingend auf einen anderen Ton.', 'Schall kann sich nur in Fahrtrichtung ausbreiten.', 'Die Luft verliert hinter dem Fahrzeug ihre Dichte vollständig.'],
  'Die Bewegung der Schallquelle verändert die Abstände der ankommenden Wellenfronten. Bei Annäherung treffen sie häufiger ein und der Ton wird höher; dieser Dopplereffekt tritt auch bei Licht auf.',
  'OpenStax · The Doppler Effect', 'https://openstax.org/books/university-physics-volume-1/pages/17-7-the-doppler-effect');
fact('halbwertszeit', 2, 'Kernphysik',
  'Welcher Anteil eines radioaktiven Ausgangsstoffs ist nach zwei Halbwertszeiten im Mittel noch nicht zerfallen?',
  ['25 Prozent', '50 Prozent', '0 Prozent', '75 Prozent'],
  'Nach jeder Halbwertszeit bleibt im Mittel die Hälfte der noch vorhandenen radioaktiven Kerne übrig. Nach zwei solchen Zeitspannen sind das eine Hälfte von einer Hälfte, also ein Viertel; der Zerfall einzelner Kerne bleibt zufällig.',
  'OpenStax · Half-Life and Activity', 'https://openstax.org/books/college-physics-2e/pages/31-5-half-life-and-activity');

// Challenge: Transfer, überraschende Anwendungen und präzise Begriffskenntnis.
fact('basisrate', 3, 'Wahrscheinlichkeit',
  '1 % einer Gruppe ist erkrankt. Ein Test erkennt 99 % der Erkrankten und meldet bei 5 % der Gesunden positiv. Wie viele Positive sind ungefähr wirklich erkrankt?',
  ['Etwa 17 Prozent', 'Etwa 50 Prozent', 'Etwa 95 Prozent', 'Etwa 99 Prozent'],
  'Unter 10.000 Menschen wären etwa 99 richtig positive und 495 falsch positive Ergebnisse zu erwarten. Somit sind nur 99 von 594 Positiven, also rund 17 Prozent, tatsächlich erkrankt: Die Grundhäufigkeit beeinflusst den Aussagewert eines Tests stark.',
  'OpenStax · Conditional probabilities in contingency tables', 'https://openstax.org/books/introductory-statistics-2e/pages/3-4-contingency-tables');
fact('photoeffekt', 3, 'Quantenphysik',
  'Was erhöht beim Photoeffekt an demselben Metall die maximale kinetische Energie der ausgelösten Elektronen?',
  ['Eine höhere Lichtfrequenz oberhalb der Grenzfrequenz', 'Allein eine höhere Intensität bei gleicher Frequenz', 'Allein eine längere Beleuchtungsdauer bei gleicher Frequenz', 'Eine niedrigere Lichtfrequenz unterhalb der Grenzfrequenz'],
  'Ein Photon liefert die Energie h mal Frequenz; nach Abzug der Austrittsarbeit bleibt Energie für das Elektron. Mehr Intensität bedeutet bei gleicher Frequenz mehr Photonen, aber nicht mehr Energie pro Photon.',
  'OpenStax · Photoelectric Effect', 'https://openstax.org/books/university-physics-volume-3/pages/6-2-photoelectric-effect');
fact('pet-antimaterie', 3, 'Medizintechnik',
  'Welches Teilchen trifft bei der Positronen-Emissions-Tomographie auf ein Elektron und erzeugt dabei typischerweise zwei nachweisbare Gammaphotonen?',
  ['Ein Positron', 'Ein Neutron', 'Ein Proton', 'Ein Alphateilchen'],
  'Ein Positron ist das positiv geladene Antiteilchen des Elektrons. Bei ihrer Annihilation entstehen typischerweise zwei Gammaphotonen in entgegengesetzten Richtungen, aus denen ein PET-Scanner die Verteilung eines Tracers rekonstruiert.',
  'NIBIB · Nuclear Medicine: PET', 'https://www.nibib.nih.gov/science-education/science-topics/nuclear-medicine');
fact('simpson', 3, 'Statistik',
  'Was beschreibt das Simpson-Paradoxon?',
  ['Ein Trend in Teilgruppen kann sich nach deren Zusammenfassung umkehren.', 'Ein Mittelwert kann niemals zwischen zwei Messwerten liegen.', 'Eine größere Stichprobe enthält grundsätzlich mehr Messfehler.', 'Zwei gleich große Gruppen haben immer dieselbe Erfolgsquote.'],
  'Unterschiedliche Gruppengrößen und Zusammensetzungen können einen Zusammenhang in aggregierten Daten umkehren. Deshalb lohnt sich bei Vergleichen etwa von Behandlungserfolgen der Blick auf relevante Teilgruppen und deren Ausgangsbedingungen.',
  'Stanford Encyclopedia of Philosophy · Simpson’s Paradox', 'https://plato.stanford.edu/entries/paradox-simpson/');
fact('nash', 3, 'Spieltheorie',
  'Wann liegt ein Nash-Gleichgewicht vor?',
  ['Niemand kann sich durch einen einseitigen Strategiewechsel verbessern.', 'Alle Beteiligten erzielen zwingend denselben Gewinn.', 'Der gemeinsame Gesamtgewinn ist immer maximal.', 'Alle Beteiligten müssen dieselbe Strategie wählen.'],
  'Im Nash-Gleichgewicht ist jede Strategie eine beste Antwort auf die Strategien der anderen. Das muss für die Gruppe insgesamt nicht optimal sein, wie das Gefangenendilemma zeigt.',
  'Stanford Encyclopedia of Philosophy · Epistemic Foundations of Game Theory', 'https://plato.stanford.edu/entries/epistemic-game/');
fact('crispr-rna', 3, 'Biotechnologie',
  'Was lenkt die Genschere Cas9 im üblichen CRISPR-Cas9-System zu einer passenden Zielsequenz?',
  ['Eine passende guide-RNA', 'Die Farbe des Zellkerns', 'Ein Antikörper gegen sämtliche DNA', 'Die Geschwindigkeit der Zellteilung allein'],
  'Eine guide-RNA kann durch komplementäre Basenpaarung die passende Zielsequenz erkennen und Cas9 dorthin führen. Das System wurde aus einer bakteriellen Abwehr gegen fremdes genetisches Material für die Forschung angepasst.',
  'NHGRI · How Does Genome Editing Work?', 'https://www.genome.gov/about-genomics/policy-issues/Genome-Editing/How-genome-editing-works');
fact('epigenetik', 3, 'Genregulation',
  'Welche Veränderung ist ein Beispiel für epigenetische Regulation?',
  ['DNA-Methylierung ohne Änderung der Basensequenz', 'Der Austausch einer DNA-Base durch eine andere', 'Der Verlust eines gesamten Chromosoms', 'Die Verdopplung der Chromosomenzahl'],
  'Epigenetische Markierungen können beeinflussen, wie Gene abgelesen werden, ohne die Reihenfolge der DNA-Basen zu verändern. Dazu gehören chemische Markierungen an DNA und Histonen; die gleiche DNA kann so in verschiedenen Zelltypen unterschiedlich genutzt werden.',
  'NHGRI · Epigenomics Fact Sheet', 'https://www.genome.gov/about-genomics/fact-sheets/Epigenomics-Fact-Sheet');
fact('falsifizierbarkeit', 3, 'Wissenschaftstheorie',
  'Was meint Karl Poppers Kriterium der Falsifizierbarkeit einer empirischen Theorie?',
  ['Es müssen denkbare Beobachtungen möglich sein, die ihr widersprechen.', 'Sie muss schon durch eine einzige Bestätigung endgültig bewiesen sein.', 'Sie muss von allen Menschen für plausibel gehalten werden.', 'Sie muss grundsätzlich vor jeder Beobachtung geschützt sein.'],
  'Nach Popper soll eine empirische Theorie an der Erfahrung scheitern können, statt jede mögliche Beobachtung nachträglich zu erklären. Viele Bestätigungen machen einen allgemeinen Satz dabei nicht logisch unangreifbar.',
  'Stanford Encyclopedia of Philosophy · Karl Popper', 'https://plato.stanford.edu/entries/popper/');

export const generalQuestions = catalog;
