// Oberstufen-Vergleiche: Jede Familie liefert eine Maximal- und eine Minimalfrage.
// Größen, Bezugsgruppen und Datenstände sind fest angegeben; Gegenfragen teilen
// eine familyId und werden im selben Flug deshalb nicht erneut verwendet.
const families = [];
function add(id, difficulty, category, prompts, rows, detail, source, basisLabel, basis = 'curated') {
  families.push({ id, difficulty, category, prompts, rows, detail, source, basisLabel, basis });
}
const source = (title, url) => ({ title, url });
const pct = value => value.toLocaleString('de-DE', { maximumFractionDigits: 5 }) + ' %';
const rows = (items, unit = '%') => items.map(([id, label, value]) => [id, label, value, unit === '%' ? pct(value) : value.toLocaleString('de-DE', { maximumFractionDigits: 3 }) + (unit ? ' ' + unit : '')]);
const nasa = source('NASA NSSDC · Planetary Fact Sheet', 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/');

// Grundlagen und Größenordnungen; die Stufe steht bei jeder Familie explizit.
add('atmosphaere', 1, 'Atmosphäre',
  ['Welches dieser Gase hat den größten Volumenanteil in trockener Erdatmosphäre?', 'Welches dieser Gase ist in trockener Erdatmosphäre am seltensten?'],
  rows([['n2','Stickstoff',78.084],['o2','Sauerstoff',20.946],['ar','Argon',.934],['ne','Neon',.0018]]),
  'Luft besteht überwiegend aus Stickstoff, obwohl wir zum Atmen Sauerstoff brauchen. Schon Argon ist viel häufiger als das oft auffälligere Edelgas Neon.',
  source('NOAA · The Atmosphere', 'https://www.noaa.gov/jetstream/atmosphere'), 'Trockene Luft · typische Volumenanteile');
add('erdkruste', 2, 'Geologie',
  ['Welches dieser Elemente ist nach Masse in der Erdkruste am häufigsten?', 'Welches dieser Elemente hat den kleinsten Massenanteil an der Erdkruste?'],
  rows([['o','Sauerstoff',46.6],['si','Silicium',27.7],['al','Aluminium',8.3],['fe','Eisen',5]]),
  'Sauerstoff steckt hier vor allem gebunden in Mineralen und nicht als Atemgas. Silicate aus Silicium und Sauerstoff bilden den größten Teil der Erdkruste.',
  source('Open University · Elements in crust and mantle', 'https://www.open.edu/openlearn/science-maths-technology/an-introduction-minerals-and-rocks-under-the-microscope/content-section-3.1'), 'Erdkruste · gerundete mittlere Massenanteile');
add('koerperelemente', 1, 'Biochemie',
  ['Welches dieser Elemente macht den größten Anteil der menschlichen Körpermasse aus?', 'Welches dieser Elemente hat im menschlichen Körper den kleinsten Massenanteil?'],
  rows([['o','Sauerstoff',65],['c','Kohlenstoff',18],['h','Wasserstoff',10],['n','Stickstoff',3]]),
  'Der hohe Wasseranteil des Körpers macht Sauerstoff zum Spitzenreiter nach Masse. Nach Anzahl der Atome wäre dagegen Wasserstoff vorn: Ein Wasserstoffatom ist sehr leicht.',
  source('OpenStax · Biology 2e, Elements in living organisms', 'https://openstax.org/books/biology-2e/pages/2-1-atoms-isotopes-ions-and-molecules-the-building-blocks'), 'Menschlicher Körper · gerundete Massenanteile');
add('suesswasser', 1, 'Wasser & Klima',
  ['Wo liegt nach der USGS-Schätzung der größte Anteil des weltweiten Süßwassers?', 'Welcher dieser Speicher enthält nach der USGS-Schätzung am wenigsten Süßwasser?'],
  rows([['eis','Gletscher und Eiskappen',68.7],['grund','Süßes Grundwasser',30.1],['seen','Süßwasserseen',.26],['luft','Atmosphäre',.04]]),
  'Das meiste Süßwasser ist gefroren oder befindet sich unter der Erde. Die gut sichtbaren Seen enthalten nur einen winzigen Teil der gesamten Süßwassermenge.',
  source('USGS · How Much Water is There on Earth?', 'https://www.usgs.gov/water-science-school/science/how-much-water-there-earth'), 'Globale Wasserspeicher · Anteil am gesamten Süßwasser');
add('blutgruppen', 1, 'Mensch & Gesellschaft',
  ['Welche AB0-Blutgruppe kommt laut DRK in Deutschland am häufigsten vor?', 'Welche AB0-Blutgruppe ist laut DRK in Deutschland am seltensten?'],
  rows([['a','A',43],['null','0',41],['b','B',11],['ab','AB',5]]),
  'Blutgruppen sind regional unterschiedlich verteilt. Für Bluttransfusionen ist neben dem AB0-System unter anderem auch der Rhesusfaktor wichtig; die Häufigkeit allein sagt nichts über die Verträglichkeit aus.',
  source('DRK-Blutspendedienste · Verteilung von Blutgruppen', 'https://www.drk-blutspende.de/verteilung'), 'Deutschland · AB0-Verteilung laut DRK, ohne Rhesus-Unterteilung');
add('strom-de-2024', 1, 'Energie',
  ['Welcher dieser Energieträger lieferte 2024 den größten Anteil der deutschen Stromeinspeisung?', 'Welcher dieser Energieträger lieferte 2024 den kleinsten Anteil der deutschen Stromeinspeisung?'],
  rows([['wind','Windkraft',31.5],['kohle','Kohle',22.5],['gas','Erdgas',14.9],['pv','Photovoltaik',13.8]]),
  'Windkraft lag in dieser Erhebung vor Kohle. Gemeint ist die in Deutschland erzeugte und ins öffentliche Netz eingespeiste Elektrizität, nicht der gesamte Energieverbrauch einschließlich Verkehr und Heizung.',
  source('Destatis · Pressemitteilung Nr. 091 vom 12. März 2025', 'https://www.destatis.de/DE/Presse/Pressemitteilungen/2025/03/PD25_091_43312.html'), 'Deutschland 2024 · ursprüngliche vorläufige Destatis-Veröffentlichung', 'measured');
add('treibhausgas-mengen-2019', 2, 'Klimawissen',
  ['Welche Gasgruppe hatte 2019 den größten Anteil an den globalen menschengemachten Treibhausgasemissionen in CO₂-Äquivalenten?', 'Welche dieser Gasgruppen hatte 2019 den kleinsten Anteil an den globalen Treibhausgasemissionen in CO₂-Äquivalenten?'],
  rows([['co2','Kohlendioxid',45],['ch4','Methan',11],['n2o','Lachgas',2.7],['fgas','Fluorierte Gase',1.4]], 'Gt CO₂-Äquivalente'),
  'CO₂-Äquivalente berücksichtigen, dass Gase pro Kilogramm unterschiedlich stark zur Erwärmung beitragen. Das ist ein Vergleich der gesamten Emissionsmengen, nicht der Klimawirkung eines einzelnen Moleküls.',
  source('IPCC AR6 WGIII · Technical Summary', 'https://www.ipcc.ch/report/ar6/wg3/chapter/technical-summary/'), 'Global 2019 · GWP über 100 Jahre, AR6');
add('naehrstoffenergie', 1, 'Ernährung & Chemie',
  ['Welche dieser Stoffgruppen hat laut EU-Nährwertberechnung den höchsten Energiegehalt pro Gramm?', 'Welche dieser Stoffgruppen hat laut EU-Nährwertberechnung den niedrigsten Energiegehalt pro Gramm?'],
  rows([['fett','Fett',9],['alkohol','Ethanol',7],['kohlenhydrate','Kohlenhydrate ohne Polyole',4],['faser','Ballaststoffe',2]], 'kcal/g'),
  'Auch Alkohol liefert Energie, obwohl er kein notwendiger Nährstoff ist. Die Faktoren sind vereinbarte Werte für die Lebensmittelkennzeichnung; Ballaststoffe werden teilweise durch Darmbakterien verwertet.',
  source('EU-Verordnung 1169/2011 · Anhang XIV', 'https://eur-lex.europa.eu/eli/reg/2011/1169/oj/eng'), 'EU-Lebensmittelkennzeichnung · Umrechnungsfaktoren');
add('lichtfarben', 1, 'Physik',
  ['Welche dieser sichtbaren Lichtfarben hat die höchste typische Frequenz?', 'Welche dieser sichtbaren Lichtfarben hat die niedrigste typische Frequenz?'],
  rows([['violett','Violettes Licht',750],['blau','Blaues Licht',667],['gruen','Grünes Licht',566],['rot','Rotes Licht',428]], 'THz, ungefähr'),
  'Kurze Wellenlänge bedeutet hohe Frequenz, und mit der Frequenz steigt die Energie eines einzelnen Photons. Deshalb liegt energiereiches UV-Licht jenseits des violetten Endes des sichtbaren Spektrums.',
  source('NASA · Visible Light', 'https://science.nasa.gov/ems/09_visiblelight/'), 'Repräsentative sichtbare Wellenlängen · keine scharfen Farbgrenzen');
add('genetischer-code', 2, 'Genetik',
  ['Welche dieser Aminosäuren wird im Standardcode durch die meisten verschiedenen Codons codiert?', 'Welche dieser Aminosäuren wird im Standardcode durch die wenigsten verschiedenen Codons codiert?'],
  rows([['leu','Leucin',6],['ala','Alanin',4],['ile','Isoleucin',3],['met','Methionin',1]], 'Codons'),
  'Der genetische Code ist redundant: Mehrere Basentripletts können dieselbe Aminosäure bedeuten. Methionins einziges Codon AUG dient im Standardfall zugleich als Startsignal der Translation.',
  source('NCBI · The Standard Genetic Code, Translation Table 1', 'https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi#SG1'), 'Standard-Genetischer Code · Anzahl unterschiedlicher Codons');
add('ozeanflaechen', 1, 'Geografie',
  ['Welcher dieser Ozeane hat den größten Anteil an der weltweiten Ozeanfläche?', 'Welcher dieser Ozeane hat den kleinsten Anteil an der weltweiten Ozeanfläche?'],
  rows([['pazifik','Pazifischer Ozean',45],['atlantik','Atlantischer Ozean',22.2],['indisch','Indischer Ozean',20],['arktisch','Arktischer Ozean',3.3]]),
  'Der Pazifik allein bedeckt fast die Hälfte der Ozeanfläche. Die genaue Aufteilung hängt von der verwendeten Abgrenzung der Ozeane ab; hier gilt ausdrücklich die NOAA-Tabelle.',
  source('NOAA JetStream · The Ocean', 'https://www.noaa.gov/jetstream/ocean'), 'Anteil an der Ozeanfläche · Abgrenzung der NOAA-Tabelle');
add('sonnen-elemente', 2, 'Astronomie',
  ['Welches dieser Elemente hat in der Sonnen-Photosphäre den größten Massenanteil?', 'Welches dieser Elemente hat in der Sonnen-Photosphäre den kleinsten Massenanteil?'],
  rows([['h','Wasserstoff',73.4],['he','Helium',25],['o','Sauerstoff',.8],['c','Kohlenstoff',.3]]),
  'Das Licht der Sonne verrät durch Spektrallinien, welche Elemente sie enthält. Die heutige äußere Schicht besteht größtenteils aus Wasserstoff und Helium; im Kern wandelt Fusion Wasserstoff in Helium um.',
  source('University of Northern Iowa · The Most Abundant Elements in the Sun', 'https://sites.uni.edu/morgans/astro/course/Notes/section2/solarcomp.html'), 'Sonnen-Photosphäre · gerundete Massenanteile der Lehrtabelle');

// Einordnen, Modelle anwenden und bekannte Fakten vertiefen.
add('edelgase-luft', 2, 'Atmosphärenchemie',
  ['Welches dieser Edelgase kommt in trockener Luft am häufigsten vor?', 'Welches dieser Edelgase kommt in trockener Luft am seltensten vor?'],
  rows([['ne','Neon',18],['he','Helium',5.24],['kr','Krypton',1.14],['xe','Xenon',.087]], 'ppm Volumenanteil'),
  'Edelgase reagieren nur sehr schwer mit anderen Stoffen. Trotz seines Namens ist Neon in der Luft deutlich häufiger als Helium; Argon wäre noch viel häufiger, gehört aber nicht zu dieser Auswahl.',
  source('IUPAC Gold Book · Composition of pure air', 'https://goldbook.iupac.org/terms/view/C01214/html'), 'Trockene Luft · IUPAC-Referenzwerte, gerundet');
add('planetendichte', 2, 'Planetenphysik',
  ['Welcher dieser Planeten hat die größte mittlere Dichte?', 'Welcher dieser Planeten hat die kleinste mittlere Dichte?'],
  rows([['erde','Erde',5514],['merkur','Merkur',5429],['mars','Mars',3934],['saturn','Saturn',687]], 'kg/m³'),
  'Ein großer Planet muss nicht besonders dicht sein. Saturns mittlere Dichte liegt sogar unter der von Wasser, weil er überwiegend aus leichten Stoffen wie Wasserstoff und Helium besteht.', nasa, 'NASA-Referenzwerte · mittlere Gesamtdichte');
add('rotation-planeten', 2, 'Astronomie',
  ['Welcher dieser Planeten braucht für eine Eigendrehung relativ zu den Fixsternen am längsten?', 'Welcher dieser Planeten braucht für eine Eigendrehung relativ zu den Fixsternen am kürzesten?'],
  rows([['venus','Venus',5832.5],['merkur','Merkur',1407.6],['erde','Erde',23.9],['jupiter','Jupiter',9.9]], 'Stunden'),
  'Venus rotiert extrem langsam und zudem rückläufig. Eine Eigendrehung relativ zu den Sternen ist etwas anderes als ein Sonnentag von einem Sonnenhöchststand bis zum nächsten.', nasa, 'NASA · Betrag der siderischen Rotationsperiode');
add('schwerkraft', 1, 'Raumfahrt',
  ['Wo ist unter diesen vier Himmelskörpern die Oberflächen-Fallbeschleunigung am größten?', 'Wo ist unter diesen vier Himmelskörpern die Oberflächen-Fallbeschleunigung am kleinsten?'],
  rows([['jupiter','Jupiter',23.1],['erde','Erde',9.8],['mars','Mars',3.7],['mond','Mond',1.6]], 'm/s²'),
  'Deine Masse bleibt beim Ortswechsel gleich, dein Gewicht als Kraft nicht. Bei Gasplaneten verwendet die NASA einen definierten Referenzpegel statt einer festen begehbaren Oberfläche.', nasa, 'NASA · Referenz-Oberflächengravitation');
add('emissions-sektoren', 2, 'Klima & Wirtschaft',
  ['Welcher dieser Sektoren verursachte 2019 direkt die meisten globalen Treibhausgasemissionen?', 'Welcher dieser Sektoren verursachte 2019 direkt die wenigsten globalen Treibhausgasemissionen?'],
  rows([['energie','Energieversorgung',34],['industrie','Industrie',24],['afolu','Landwirtschaft, Forst und Landnutzung',22],['verkehr','Verkehr',15]]),
  'Bei dieser direkten Zuordnung zählt Kraftwerksstrom zur Energieversorgung, auch wenn er später in einem Gebäude verbraucht wird. Eine andere Zuordnung der Stromemissionen würde die Sektoranteile verändern.',
  source('IPCC AR6 WGIII · Chapter 2, Emissions trends and drivers', 'https://www.ipcc.ch/report/ar6/wg3/chapter/chapter-2/'), 'Global 2019 · direkte Sektorzuordnung des IPCC');
add('wasserfussabdruck', 1, 'Umwelt',
  ['Welches Fleisch hat in der genannten globalen Studie den größten Wasserfußabdruck pro Kilogramm?', 'Welches Fleisch hat in der genannten globalen Studie den kleinsten Wasserfußabdruck pro Kilogramm?'],
  rows([['rind','Rindfleisch',15400],['schaf','Schaffleisch',10400],['schwein','Schweinefleisch',6000],['huhn','Hühnerfleisch',4300]], 'Liter/kg, ungefähr'),
  'Der Wasserfußabdruck umfasst auch Regenwasser für Futtermittel und rechnerisch zur Verdünnung von Verschmutzung benötigtes Wasser. Er ist deshalb nicht mit direkt entnommenem Trinkwasser gleichzusetzen und variiert stark nach Produktionssystem.',
  source('Mekonnen & Hoekstra · Water footprint of farm animals, 2010', 'https://digitalcommons.unl.edu/wffdocs/83/'), 'Globale Mittelwerte · Studie 2010, gerundet', 'measured');
add('strom-welt-2023', 2, 'Globale Energie',
  ['Welche dieser Quellen lieferte laut Ember 2023 den größten Anteil der weltweiten Stromerzeugung?', 'Welche dieser Quellen lieferte laut Ember 2023 den kleinsten Anteil der weltweiten Stromerzeugung?'],
  rows([['kohle','Kohle',35.4],['gas','Erdgas',22.5],['wasser','Wasserkraft',14.3],['kern','Kernenergie',9.1]]),
  'Der weltweite Strommix unterscheidet sich deutlich vom deutschen. Wasserkraft war 2023 weltweit die größte einzelne CO₂-arme Stromquelle, während Kohle den größten Gesamtanteil lieferte.',
  source('Ember · Global Electricity Review 2024', 'https://ember-energy.org/latest-insights/global-electricity-review-2024/electricity-transition-in-2023/'), 'Global 2023 · Datenstand des Ember-Berichts 2024', 'measured');
add('eisen-isotope', 2, 'Kernchemie',
  ['Welches dieser Eisenisotope ist in natürlichem Eisen am häufigsten?', 'Welches dieser Eisenisotope ist in natürlichem Eisen am seltensten?'],
  rows([['fe54','Eisen-54',5.845],['fe56','Eisen-56',91.754],['fe57','Eisen-57',2.119],['fe58','Eisen-58',.282]]),
  'Die Ordnungszahl bestimmt das Element, die Neutronenzahl unterscheidet seine Isotope. Daher ist die mittlere Atommasse von Eisen kein ganzzahliger Wert, sondern ein gewichteter Mittelwert.',
  source('CIAAW · Atomic Weight of Iron', 'https://ciaaw.org/iron.htm'), 'Natürliches Eisen · Referenz-Isotopenanteile');
add('umlauffrequenz', 1, 'Himmelsmechanik',
  ['Welcher dieser Planeten vollendet während eines Erdenjahres die meisten Sonnenumläufe?', 'Welcher dieser Planeten vollendet während eines Erdenjahres die wenigsten Sonnenumläufe?'],
  rows([['merkur','Merkur',365.256/87.969],['venus','Venus',365.256/224.701],['erde','Erde',1],['mars','Mars',365.256/686.98]], 'Umläufe pro Erdenjahr'),
  'Ein innerer Planet hat einen kürzeren Umlaufweg und bewegt sich außerdem schneller. Der Zusammenhang zwischen Umlaufdauer und Bahngröße wird durch Keplers drittes Gesetz beschrieben.',
  source('NASA NSSDC · Planetary Fact Sheet, orbital periods', 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/'), 'Mittlere siderische Umlaufzeiten · umgerechnet auf ein Erdenjahr');
add('mendel', 2, 'Genetik & Wahrscheinlichkeit',
  ['AaBb × AaBb: Bei unabhängiger Vererbung und vollständiger Dominanz ist welches Ereignis am wahrscheinlichsten?', 'AaBb × AaBb: Bei unabhängiger Vererbung und vollständiger Dominanz ist welches Ereignis am seltensten?'],
  rows([['beide-dom','Beide Merkmale dominant ausgeprägt',9/16*100],['ein-dom','Genau ein Merkmal dominant ausgeprägt',6/16*100],['beide-rez','Beide Merkmale rezessiv ausgeprägt',1/16*100],['mind-ein','Mindestens ein Merkmal dominant ausgeprägt',15/16*100]]),
  'Das klassische 9:3:3:1-Verhältnis gilt nur unter den genannten Annahmen. Für „mindestens ein dominantes Merkmal“ ist das Gegenereignis besonders einfach: Nur 1 von 16 Nachkommen zeigt beide rezessiven Merkmale.',
  source('OpenStax · Biology 2e, Laws of Inheritance', 'https://openstax.org/books/biology-2e/pages/12-3-laws-of-inheritance'), 'Mendelsches Modell · unabhängige Merkmale, vollständige Dominanz');
add('geburtstagsparadox', 2, 'Statistik',
  ['Welches Ereignis ist unter den genannten Idealannahmen am wahrscheinlichsten?', 'Welches Ereignis ist unter den genannten Idealannahmen am unwahrscheinlichsten?'],
  rows([['geburtstag','Mindestens ein gleiches Geburtstagspaar bei 23 Personen',50.7297234324],['muenze','Genau einmal Kopf bei drei fairen Münzwürfen',37.5],['zwei-kopf','Zweimal Kopf bei zwei fairen Münzwürfen',25],['wuerfel','Eine Sechs bei einem fairen Würfelwurf',100/6]]),
  'Bei 23 Personen gibt es schon 253 verschiedene Paare; deshalb überschreitet die Geburtstagsübereinstimmung überraschend die 50-Prozent-Marke. Das Modell nimmt unabhängige, gleich verteilte Geburtstage auf 365 Tagen und faire unabhängige Würfe an.',
  source('MIT · Mathematics for Computer Science, probability', 'https://courses.csail.mit.edu/6.042/spring18/mcs.pdf'), '365 gleich wahrscheinliche Geburtstage · unabhängige faire Würfe');
add('ohm-strom', 1, 'Elektrizität',
  ['An jedem dieser ohmschen Widerstände liegen einzeln 12 Volt an. Wo fließt der größte Strom?', 'An jedem dieser ohmschen Widerstände liegen einzeln 12 Volt an. Wo fließt der kleinste Strom?'],
  rows([['r10','10 Ω',1.2],['r20','20 Ω',.6],['r40','40 Ω',.3],['r80','80 Ω',.15]], 'Ampere'),
  'Nach I = U/R führt bei gleicher Spannung der kleinere Widerstand zum größeren Strom. Das gilt ausdrücklich für ohmsche Widerstände bei konstanten Bedingungen, nicht automatisch für jedes elektronische Bauteil.',
  source('OpenStax · University Physics Vol. 2, Ohm’s Law', 'https://openstax.org/books/university-physics-volume-2/pages/9-4-ohms-law'), 'Ohmsches Gesetz · gleiche Spannung, konstante Widerstände');

// Stufe 3: Kombinatorik, Skalen und übertragbares Konzeptwissen.
add('poker', 3, 'Kombinatorik',
  ['Fünf zufällige Karten aus einem 52er-Blatt ohne Joker: Welche dieser Hände ist am häufigsten?', 'Fünf zufällige Karten aus einem 52er-Blatt ohne Joker: Welche dieser Hände ist am seltensten?'],
  rows([['fullhouse','Full House',3744],['vierling','Vierling',624],['straightflush','Straight Flush ohne Royal Flush',36],['royal','Royal Flush',4]], 'mögliche Hände'),
  'Von 2.598.960 möglichen Fünf-Karten-Händen sind nur vier ein Royal Flush. Die Rechnung gilt für genau fünf ausgegebene Karten, nicht für die beste Auswahl aus sieben wie bei Texas Hold’em.',
  source('University of Hawaiʻi · Probability: 5-card poker hands', 'https://math.hawaii.edu/~ramsey/Probability/PokerHands.html'), 'Alle 52 über 5 gleich wahrscheinlichen Fünf-Karten-Hände');
const choose = (n,k) => { let v=1; for(let i=1;i<=k;i++) v=v*(n-i+1)/i; return v; };
add('lotto-treffer', 3, 'Wahrscheinlichkeit',
  ['Ein fester Tipp bei 6 aus 49, ohne Superzahl: Welches dieser Ergebnisse tritt am häufigsten auf?', 'Ein fester Tipp bei 6 aus 49, ohne Superzahl: Welches dieser Ergebnisse tritt am seltensten auf?'],
  rows([0,1,2,3].map(k=>['r'+k,'Genau '+k+' Richtige',choose(6,k)*choose(43,6-k)/choose(49,6)*100])),
  'Für genau k Treffer zählt man C(6,k) · C(43,6−k) passende Ziehungen und teilt durch C(49,6). Gar keinen Treffer zu erzielen ist sogar etwas wahrscheinlicher als genau einen; vergangene Ziehungen ändern daran nichts.',
  source('LOTTO.de · Berechnung der Gewinnwahrscheinlichkeiten', 'https://www.lotto.de/lotto-6aus49/info/gewinnwahrscheinlichkeit'), 'Ein fester 6-aus-49-Tipp · nur Trefferzahl, ohne Superzahl');
add('treibhauspotenzial', 3, 'Klimaphysik',
  ['Welches dieser Gase hat im IPCC-AR4-Vergleich pro Kilogramm das größte Treibhauspotenzial über 100 Jahre?', 'Welches dieser Gase hat im IPCC-AR4-Vergleich pro Kilogramm das kleinste Treibhauspotenzial über 100 Jahre?'],
  rows([['co2','Kohlendioxid CO₂',1],['methan','Methan CH₄',25],['lachgas','Lachgas N₂O',298],['sf6','Schwefelhexafluorid SF₆',22800]], 'GWP₁₀₀, CO₂ = 1'),
  'Ein kleiner Ausstoß eines sehr wirksamen Gases kann in CO₂-Äquivalenten groß ausfallen. Diese Aufgabe verwendet ausdrücklich die historischen AR4-Werte; neuere IPCC-Berichte aktualisieren die Faktoren.',
  source('UNFCCC · IPCC Fourth Assessment Report GWP values', 'https://unfccc.int/process-and-meetings/transparency-and-reporting/greenhouse-gas-data/frequently-asked-questions/global-warming-potentials-ipcc-fourth-assessment-report'), 'IPCC AR4 (2007) · gleiche Emissionsmasse, Zeithorizont 100 Jahre');
const remaining = t => 100 * 2 ** (-100/t);
add('radioaktiver-rest', 3, 'Kernphysik',
  ['Von welchem dieser isolierten Radionuklide bleibt nach 100 Jahren anteilig am meisten unzerfallen?', 'Von welchem dieser isolierten Radionuklide bleibt nach 100 Jahren anteilig am wenigsten unzerfallen?'],
  [['c14','Kohlenstoff-14',remaining(5700),'etwa 98,79 % übrig'],['cs137','Cäsium-137',remaining(30.04),'etwa 9,95 % übrig'],['co60','Cobalt-60',remaining(5.27),'etwa 0,000194 % übrig'],['po210','Polonium-210',remaining(138.4/365.25),'praktisch 0 % übrig']],
  'Die Restfraktion beträgt (1/2) hoch Zeit geteilt durch Halbwertszeit. Eine längere Halbwertszeit bedeutet langsameres Verschwinden der Ausgangskerne; sie sagt für sich allein nichts über sämtliche Risiken einer Probe aus.',
  source('Canadian Nuclear Safety Commission · Atoms, nuclides and radioactivity', 'https://www.cnsc-ccsn.gc.ca/eng/nuclear-safety-security/educational-resources/radiation/atoms-nuclides-radioisotopes/'), 'Isolierte Ausgangskerne · gerundete Halbwertszeiten, ohne Nachproduktion');
add('licht-in-material', 3, 'Optik',
  ['In welchem dieser durchsichtigen Materialien ist die Phasengeschwindigkeit sichtbaren Lichts am größten?', 'In welchem dieser durchsichtigen Materialien ist die Phasengeschwindigkeit sichtbaren Lichts am kleinsten?'],
  rows([['eis','Eis',299792.458/1.309],['wasser','Süßwasser',299792.458/1.333],['glas','Kronglas',299792.458/1.52],['diamant','Diamant',299792.458/2.419]], 'km/s').map(([id,label,value])=>[id,label,value,'rund '+(Math.round(value/1000)*1000).toLocaleString('de-DE')+' km/s']),
  'Für den Brechungsindex gilt n = c/v: Ein höherer Index bedeutet eine kleinere Phasengeschwindigkeit. Das oft zitierte „Lichttempo“ c ist dagegen die Geschwindigkeit im Vakuum; die Tabellenwerte hängen auch von Wellenlänge und Temperatur ab.',
  source('OpenStax · University Physics Vol. 3, The Propagation of Light', 'https://openstax.org/books/university-physics-volume-3/pages/1-1-the-propagation-of-light'), 'Typische Brechungsindizes · sichtbares Licht, Tabellenbedingungen');
add('fluchtgeschwindigkeit', 3, 'Raumfahrtphysik',
  ['Von welchem dieser Himmelskörper ist die Fluchtgeschwindigkeit am größten?', 'Von welchem dieser Himmelskörper ist die Fluchtgeschwindigkeit am kleinsten?'],
  rows([['jupiter','Jupiter',59.5],['erde','Erde',11.2],['merkur','Merkur',4.3],['mond','Mond',2.4]], 'km/s'),
  'Die Fluchtgeschwindigkeit hängt von Masse und Abstand zum Zentrum ab, nicht bloß vom Durchmesser. Sie hilft zu erklären, warum ein massereicher Gasplanet leichte Gase besser festhalten kann als ein kleiner Himmelskörper.', nasa, 'NASA · Referenz-Fluchtgeschwindigkeiten, gerundet');
add('normalverteilung', 3, 'Statistik',
  ['Z ist ideal standardnormalverteilt. Welches dieser Ereignisse ist am wahrscheinlichsten?', 'Z ist ideal standardnormalverteilt. Welches dieser Ereignisse ist am unwahrscheinlichsten?'],
  rows([['z1','Z liegt zwischen −1 und +1',68.2689492],['z2','Z liegt zwischen −2 und +2',95.4499736],['tail','Z ist größer als +2',2.2750132],['point','Z ist exakt 0',0]]),
  'Bei einer stetigen Verteilung hat jeder einzelne exakte Punkt Wahrscheinlichkeit null, obwohl Werte beliebig nah daran auftreten. Messgeräte runden jedoch: „angezeigt 0“ beschreibt dann ein Intervall und ist nicht dasselbe Ereignis.',
  source('NIST/SEMATECH · What do we mean by Normal data?', 'https://www.itl.nist.gov/div898/handbook/pmc/section5/pmc51.htm'), 'Ideale stetige Standardnormalverteilung · ohne Rundung');
const entropy = p => p===0||p===1?0:-p*Math.log2(p)-(1-p)*Math.log2(1-p);
add('informationsentropie', 3, 'Informationstheorie',
  ['Ein binäres Zufallssignal liefert 0 oder 1. Welche Wahrscheinlichkeitsverteilung hat die größte Shannon-Entropie?', 'Ein binäres Zufallssignal liefert 0 oder 1. Welche Wahrscheinlichkeitsverteilung hat die kleinste Shannon-Entropie?'],
  rows([['p50','50 % zu 50 %',entropy(.5)],['p80','80 % zu 20 %',entropy(.8)],['p95','95 % zu 5 %',entropy(.95)],['p100','100 % zu 0 %',entropy(1)]], 'Bit pro Zeichen'),
  'Ein völlig vorhersehbares Zeichen liefert keine neue Information und hat Entropie null. Die gleich verteilte binäre Quelle ist maximal ungewiss und liefert im Mittel ein Bit Information pro Zeichen.',
  source('MIT 6.050J · Information and Entropy, Chapter 5', 'https://mtlsites.mit.edu/Courses/6.050/2007/notes/chapter5.pdf'), 'Shannon-Entropie einer unabhängigen binären Quelle');

export const frequencyQuestions = families.flatMap(family => ['common','rare'].map(type => {
  const options = family.rows.map(([id,label,value,displayValue]) => ({id:'mss-freq-'+family.id+'-'+id,label,value,displayValue}));
  const sorted=[...options].sort((a,b)=>a.value-b.value);
  const correct = type==='common'?sorted.at(-1):sorted[0];
  return {
    id:'mss-freq-'+family.id+'-'+type,
    familyId:'mss-freq-'+family.id,
    difficulty:family.difficulty,type,category:family.category,
    prompt:family.prompts[type==='common'?0:1],
    options,correctId:correct.id,
    explanation:`${correct.label}: ${correct.displayValue}. ${family.detail}`,
    source:family.source,basis:family.basis,basisLabel:family.basisLabel
  };
}));
