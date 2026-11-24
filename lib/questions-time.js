// Historical ordering uses precisely named publications, patents, launches and
// legal acts. Dates describe those milestones rather than a vague invention era.
const families = [];
function timeline(id, difficulty, category, subject, rows, insight, title, url) {
  if (rows.length !== 4 || new Set(rows.map(row => row[1])).size !== 4) throw new Error('Ambiguous timeline: ' + id);
  families.push({ id, difficulty, category, subject, rows, insight, source: { title, url } });
}

// Vertraute Entwicklungen; große Zeitabstände erleichtern das Einordnen.
timeline('kommunikationsspruenge',1,'Kommunikation','Stationen der Informationsgeschichte',[
  ['Druck der Gutenberg-Bibel',1455],['Bells US-Telefonpatent',1876],['Erste Nachricht im ARPANET',1969],['Berners-Lees erster Web-Vorschlag',1989]
], 'Das Web ist jünger als das Internet: Es verknüpft Dokumente über ein bereits vorhandenes Computernetz. Buchdruck und Telefon veränderten die Verbreitung von Information lange vor digitalen Netzen.', 'CERN · The birth of the Web','https://home.cern/science/computing/the-birth-of-the-web');
timeline('unterwegs',1,'Mobilität','Meilensteine von Dampf, Schiene und Flug',[
  ['Newcomens erste erfolgreiche Dampfmaschine',1712],['Rennsieg der Lokomotive Rocket in Rainhill',1829],['Motorflug der Brüder Wright in Kitty Hawk',1903],['Erstflug der Boeing 747',1969]
], 'Die Dampfmaschine wurde zunächst zum Abpumpen von Wasser in Bergwerken eingesetzt. Erst später trieb Dampfkraft Eisenbahnen an und veränderte das Reisen.', 'Science Museum · Thomas Newcomen and the steam engine','https://collection.sciencemuseumgroup.org.uk/objects/co50900/newcomen-atmospheric-engine');
timeline('chips',1,'Digitaltechnik','Entwicklungsschritte der Mikroelektronik',[
  ['Erster funktionierender Transistor',1947],['Erster integrierter Schaltkreis von Kilby',1958],['Erster Mikroprozessor Intel 4004 kommt auf den Markt',1971],['Vorstellung des ersten iPhone',2007]
], 'Ein Transistor schaltet oder verstärkt elektrische Signale. Integrierte Schaltkreise vereinten viele Bauteile auf einem Chip und machten kompakte Computer und Smartphones möglich.', 'Computer History Museum · The Silicon Engine','https://www.computerhistory.org/siliconengine/timeline/');
timeline('buecher',1,'Literatur','Erstveröffentlichungen dieser Bücher',[
  ['Mary Shelleys Frankenstein',1818],['Darwins On the Origin of Species',1859],['George Orwells Nineteen Eighty-Four',1949],['Harry Potter and the Philosopher’s Stone',1997]
], 'Frankenstein erschien lange vor elektrischen Computern und diskutiert trotzdem bis heute aktuelle Fragen wissenschaftlicher Verantwortung. Orwells Romantitel 1984 bezeichnet dagegen eine damals vorgestellte Zukunft.', 'U.S. National Library of Medicine · The Birth of Frankenstein','https://www.nlm.nih.gov/exhibition/frankenstein/exhibition1.html');
timeline('medien',1,'Mediengeschichte','Veröffentlichungen und Vorführungen dieser Medien',[
  ['Öffentliche Cinématographe-Vorführung der Lumières in Paris',1895],['Columbias Einführung der Langspielplatte',1948],['Marktstart des Sony Walkman in Japan',1979],['Vorstellung des ersten Apple iPod',2001]
], 'Die Langspielplatte nutzte feinere Rillen und eine geringere Drehzahl als viele ältere Schellackplatten. Tragbare Kassettenspieler machten persönliche Musikauswahl später auch unterwegs selbstverständlich.', 'Library of Congress · The First Long-Playing Disc','https://blogs.loc.gov/now-see-hear/2019/04/inside-the-archival-box-the-first-long-playing-disc/');
timeline('rechte',1,'Politik','Dokumente der Rechts- und Verfassungsgeschichte',[
  ['Besiegelung der Magna Carta',1215],['US-Unabhängigkeitserklärung',1776],['Französische Erklärung der Menschen- und Bürgerrechte',1789],['UN-Erklärung der Menschenrechte',1948]
], 'Die Allgemeine Erklärung von 1948 formuliert Menschenrechte für alle Menschen. Frühere Dokumente waren wichtige Vorläufer, gewährten ihre Rechte aber historisch häufig nur begrenzten Gruppen.', 'Vereinte Nationen · Universal Declaration of Human Rights','https://www.un.org/en/about-us/universal-declaration-of-human-rights');
timeline('deutsche-demokratie',1,'Deutsche Geschichte','Verfassungsstationen und staatliche Ereignisse',[
  ['Verabschiedung der Paulskirchenverfassung',1849],['Inkrafttreten der Weimarer Reichsverfassung',1919],['Verkündung des Grundgesetzes',1949],['Deutsche Wiedervereinigung',1990]
], 'Die Paulskirchenverfassung scheiterte politisch, enthielt aber bereits Grundrechte. Das Grundgesetz entstand bewusst aus der Erfahrung mit dem Scheitern der Weimarer Demokratie und der NS-Diktatur.', 'Deutscher Bundestag · Geschichte des deutschen Parlamentarismus','https://www.bundestag.de/parlament/geschichte');
timeline('europa',2,'Europa','Schritte der europäischen Einigung',[
  ['Unterzeichnung des EGKS-Vertrags in Paris',1951],['Unterzeichnung der Römischen Verträge',1957],['Inkrafttreten des Maastricht-Vertrags',1993],['Einführung des Euro-Bargelds',2002]
], 'Die europäische Einigung begann mit gemeinsamer Kontrolle von Kohle und Stahl, also zentralen Rohstoffen der Rüstungsindustrie. Der Euro existierte schon ab 1999 als Buchgeld, bevor 2002 Münzen und Scheine folgten.', 'Europäische Union · Europe in 12 lessons','https://op.europa.eu/webpub/com/eu-in-12-lessons/en/');
timeline('medizinalltag',1,'Medizin','konkret benannte medizinische Meilensteine',[
  ['Jenners Pockenimpfversuch an James Phipps',1796],['Flemings Beobachtung der Penicillin-Wirkung',1928],['Zulassung des Salk-Polioimpfstoffs in den USA',1955],['Erste EU-Zulassung eines COVID-19-Impfstoffs',2020]
], 'Eine Entdeckung ist noch kein unmittelbar verfügbares Medikament: Zwischen Flemings Beobachtung und der breiten Anwendung von Penicillin lagen viele Jahre. Impfstoffe trainieren dagegen das Immunsystem, bevor eine bestimmte Infektion auftritt.', 'WHO · A brief history of vaccines','https://www.who.int/news-room/spotlight/history-of-vaccination/a-brief-history-of-vaccination');
timeline('raumfahrt',1,'Raumfahrt','Premieren der bemannten und unbemannten Raumfahrt',[
  ['Start von Sputnik 1',1957],['Gagarins Flug mit Wostok 1',1961],['Mondlandung von Apollo 11',1969],['Start des ISS-Moduls Sarja',1998]
], 'Sputnik 1 war etwa so groß wie ein Wasserball und markierte den Beginn des Satellitenzeitalters. Die ISS wurde Jahrzehnte später Stück für Stück in der Erdumlaufbahn zusammengesetzt.', 'NASA · 60 Moments in NASA History','https://www.nasa.gov/specials/timeline/index.html');
timeline('digitale-dienste',1,'Digitale Kultur','Starttermine dieser digitalen Angebote',[
  ['Versand der ersten SMS',1992],['Upload des ersten YouTube-Videos',2005],['Vorstellung des ersten iPhone',2007],['Veröffentlichung von Instagram',2010]
], 'Die erste SMS lautete „Merry Christmas“ und wurde von einem Computer an ein Mobiltelefon geschickt. Mobile Internetdienste und Smartphones sind deshalb nicht mit dem Beginn digitaler Kurznachrichten gleichzusetzen.', 'Vodafone · The first ever text message','https://www.vodafone.com/news/newsroom/technology/25-anniversary-text-message');
timeline('umweltvertraege',2,'Umweltpolitik','Abkommen und Institutionen des Umweltschutzes',[
  ['Unterzeichnung des Montrealer Protokolls',1987],['Gründung des Weltklimarats IPCC',1988],['Verabschiedung des Kyoto-Protokolls',1997],['Verabschiedung des Pariser Klimaabkommens',2015]
], 'Das Montrealer Protokoll schützt die Ozonschicht, während Kyoto und Paris den Klimawandel adressieren. Beides hängt mit menschlichen Emissionen zusammen, betrifft aber unterschiedliche physikalische Probleme.', 'UNFCCC · The Kyoto Protocol','https://unfccc.int/kyoto_protocol');

// Veröffentlichungen, Entdeckungen und spätere Anwendungen unterscheiden.
timeline('teilchen-entdeckungen',2,'Physik','Entdeckungen zum Aufbau von Materie und Strahlung',[
  ['Röntgens Entdeckung der X-Strahlen',1895],['Thomsons Identifikation des Elektrons',1897],['Chadwicks Entdeckung des Neutrons',1932],['Veröffentlichung des DNA-Doppelhelixmodells',1953]
], 'Das Elektron wurde entdeckt, bevor der Aufbau des Atomkerns verstanden war. Das erst später nachgewiesene Neutron erklärt unter anderem, warum Atome desselben Elements unterschiedliche Massen besitzen können.', 'Nobel Prize · The Nobel Prize in Physics 1901–2000','https://www.nobelprize.org/prizes/themes/the-nobel-prize-in-physics-1901-2000/');
timeline('elektrizitaet',2,'Elektrizität','wissenschaftliche Schritte auf dem Weg zur Funktechnik',[
  ['Voltas Vorstellung seiner elektrischen Säule',1800],['Faradays Entdeckung der elektromagnetischen Induktion',1831],['Maxwells Veröffentlichung A Dynamical Theory of the Electromagnetic Field',1865],['Hertz’ Veröffentlichung zum Nachweis elektromagnetischer Wellen',1888]
], 'Maxwell sagte elektromagnetische Wellen theoretisch voraus, bevor Hertz sie experimentell nachwies. Sichtbares Licht und Funkwellen gehören zum selben elektromagnetischen Spektrum.', 'KIT · Hertz: 125 Years Propagation of Electric Action','https://www.kit.edu/kit/english/pi_2013_14276.php');
timeline('chemische-ordnung',2,'Chemie','Meilensteine bei der Ordnung chemischer Elemente',[
  ['Lavoisiers Traité élémentaire de chimie',1789],['Erster Band von Daltons A New System of Chemical Philosophy',1808],['Mendelejews Veröffentlichung seines Periodensystems',1869],['Moseleys Untersuchung der Ordnungszahl',1913]
], 'Mendelejew ließ in seiner Tabelle bewusst Lücken für noch unbekannte Elemente. Erst später zeigte sich, dass die Ordnungszahl und nicht die Atommasse die zuverlässige Reihenfolge bestimmt.', 'Royal Society of Chemistry · Development of the periodic table','https://periodic-table.rsc.org/history/about');
timeline('genom',2,'Genetik','Veröffentlichungen und Methoden der Genetik',[
  ['Publikation von Mendels Versuchen über Pflanzenhybriden',1866],['Watson und Cricks DNA-Strukturartikel in Nature',1953],['Mullis’ Entwicklung der PCR-Idee',1983],['Publikation des ersten Entwurfs des menschlichen Genoms',2001]
], 'Die PCR vervielfältigt gezielt bestimmte DNA-Abschnitte und wurde dadurch zu einem zentralen Werkzeug in Forschung und Diagnostik. Der Genomentwurf von 2001 war noch keine lückenlose Sequenz aller Chromosomen.', 'NHGRI · Human Genome Project Timeline','https://www.genome.gov/human-genome-project/timeline');
timeline('kosmos-theorien',2,'Astronomie','Publikationen und Messungen über unser Universum',[
  ['Galileis Sidereus Nuncius',1610],['Newtons Principia Mathematica',1687],['Einsteins Allgemeine Relativitätstheorie',1915],['Erste direkte Messung von Gravitationswellen',2015]
], 'Galileis Fernrohrbeobachtungen zeigten unter anderem Monde, die Jupiter statt die Erde umkreisen. Gravitationswellen wurden 2015 gemessen und 2016 öffentlich bekannt gegeben; gefragt ist das Messjahr.', 'LIGO · Gravitational Waves Detected 100 Years After Einstein’s Prediction','https://www.ligo.caltech.edu/news/ligo20160211');
timeline('literarische-moderne',2,'Literatur und Gesellschaft','Erstveröffentlichungen europäischer Texte',[
  ['Goethes Faust. Der Tragödie erster Teil',1808],['Erster Band von Marx’ Das Kapital',1867],['Kafkas Die Verwandlung',1915],['Camus’ La Peste',1947]
], 'Die Texte reagieren auf sehr verschiedene gesellschaftliche Fragen: vom Erkenntnisdrang bis zu Kapitalismus, Entfremdung und Verantwortung. Ihr Veröffentlichungsjahr ist vom späteren Einfluss oder einer Verfilmung zu unterscheiden.', 'Deutsche Nationalbibliothek · Katalog','https://portal.dnb.de/');
timeline('frauenwahlrecht',2,'Demokratie','Einführungen des Frauenwahlrechts auf nationaler Ebene',[
  ['Neuseeland: Parlamentswahlrecht für Frauen',1893],['Deutschland: Einführung des Frauenwahlrechts',1918],['USA: Ratifizierung des 19. Verfassungszusatzes',1920],['Schweiz: Frauenstimmrecht auf Bundesebene',1971]
], 'Ein allgemeines Wahlrecht entstand nicht überall gleichzeitig und schloss historisch oft Gruppen aus. In der Schweiz folgte die Einführung in einzelnen Kantonen teilweise erst nach dem bundesweiten Entscheid.', 'Schweizerisches Bundesarchiv · Frauenstimmrecht in der Schweiz','https://www.bar.admin.ch/de/frauenstimmrecht-in-der-schweiz');
timeline('kernenergie',1,'Energiegeschichte','Meilensteine und Unfälle der Kernenergienutzung',[
  ['Erste kontrollierte nukleare Kettenreaktion',1942],['Kernkraftwerk Obninsk speist erstmals Strom ins Netz',1954],['Reaktorkatastrophe von Tschernobyl',1986],['Reaktorkatastrophe von Fukushima Daiichi',2011]
], 'Eine kontrollierte Kettenreaktion wurde früher erreicht als die Einspeisung von Atomstrom in ein öffentliches Netz. Obninsk war ein kleiner Forschungs- und Leistungsreaktor, kein heutiges Großkraftwerk.', 'IAEA · From Obninsk Beyond: Nuclear Power Conference Looks to Future','https://www.iaea.org/newscenter/news/obninsk-beyond-nuclear-power-conference-looks-future');
timeline('technikpatente',2,'Erfindungsgeschichte','klar benannte Veröffentlichungen, Patente und Vorführungen',[
  ['Öffentliche Bekanntgabe der Daguerreotypie',1839],['Erteilung von Edisons US-Glühlampenpatent 223898',1880],['Erteilung von Diesels deutschem Motorpatent 67207',1893],['Vorführung von Konrad Zuses Z3',1941]
], 'Patente markieren einen genau datierbaren Rechtsschritt, aber nicht automatisch die erste Idee zu einer Technik. An Fotografie, elektrischer Beleuchtung und Rechenmaschinen arbeiteten viele Menschen parallel.', 'Deutsches Museum · Konrad Zuse','https://www.deutsches-museum.de/forschung/forschungsinstitut/projekte/detailseite/konrad-zuse');
timeline('netz-und-web',2,'Internetgeschichte','Schritte vom Rechnernetz zum offenen Web',[
  ['Erste ARPANET-Nachricht von UCLA nach SRI',1969],['ARPANET-Umstellung auf TCP/IP',1983],['Erster Web-Vorschlag am CERN',1989],['CERN gibt Web-Software frei',1993]
], 'TCP/IP ermöglicht die Verbindung verschiedener Rechnernetze und bildet eine Grundlage des Internets. Die freie Verfügbarkeit der Web-Software half später, das Web weit über die Forschung hinaus zu verbreiten.', 'CERN · A short history of the Web','https://home.cern/science/computing/the-birth-of-the-web/short-history-web/');
timeline('weltreisen',1,'Geografische Geschichte','historische Reisen und Expeditionsergebnisse',[
  ['Kolumbus erreicht die Karibik',1492],['Rückkehr der Victoria nach der ersten Weltumsegelung',1522],['Cooks Endeavour erreicht Australiens Ostküste',1770],['Amundsens Expedition erreicht den Südpol',1911]
], 'Magellan begann die erste Weltumsegelung, starb aber unterwegs; die Victoria kehrte unter Elcanos Führung zurück. Solche europäischen Expeditionen waren keine „Entdeckungen“ zuvor menschenleerer Kontinente.', 'Royal Museums Greenwich · Ferdinand Magellan','https://www.rmg.co.uk/stories/explorers/ferdinand-magellan');
timeline('evolution',2,'Biologiegeschichte','Veröffentlichungen über Evolution und Vererbung',[
  ['Lamarcks Philosophie zoologique',1809],['Darwins On the Origin of Species',1859],['Mendels Versuche über Pflanzenhybriden',1866],['Dobzhanskys Genetics and the Origin of Species',1937]
], 'Darwin kannte die später zentral gewordenen Mendelschen Regeln nicht als Grundlage seiner Evolutionstheorie. Erst die moderne Synthese verband Populationsgenetik und natürliche Selektion systematisch.', 'UC Berkeley · Understanding Evolution: History of evolutionary thought','https://evolution.berkeley.edu/the-history-of-evolutionary-thought/');

// Challenge: connect developments that occurred close together or across fields.
timeline('medizinische-erkenntnis',3,'Wissenschaftsgeschichte','medizinische Publikationen und Beobachtungen',[
  ['Harveys De motu cordis über den Blutkreislauf',1628],['Semmelweis führt Händedesinfektion mit Chlorkalk ein',1847],['John Snows Untersuchung am Broad-Street-Brunnen',1854],['Kochs Bekanntgabe des Tuberkulose-Erregers',1882]
], 'Wirksame Prävention konnte der vollständigen Erklärung eines Erregers vorausgehen. Semmelweis senkte die Sterblichkeit durch Händedesinfektion, bevor die Keimtheorie allgemein akzeptiert wurde.', 'PubMed Central · Ignaz Philipp Semmelweis, public health visionary','https://pmc.ncbi.nlm.nih.gov/articles/PMC12720402/');
timeline('nobelpreise',3,'Forschung und Anerkennung','offiziell zugeordnete Nobelpreis-Jahre',[
  ['Physikpreis an Wilhelm Conrad Röntgen',1901],['Chemiepreis an Marie Curie',1911],['Physikpreis an Albert Einstein',1921],['Medizinpreis an Fleming, Chain und Florey',1945]
], 'Einsteins Auszeichnung gilt offiziell als Physikpreis von 1921, wurde aber erst 1922 verliehen. Ausgezeichnet wurde seine Erklärung des photoelektrischen Effekts, nicht ausdrücklich die Relativitätstheorie.', 'Nobel Prize · All Nobel Prizes','https://www.nobelprize.org/prizes/lists/all-nobel-prizes/');
timeline('mathematik',3,'Mathematikgeschichte','Veröffentlichungen grundlegender mathematischer Ideen',[
  ['Leibniz’ erster veröffentlichter Differentialkalkül-Artikel',1684],['Gauss’ Disquisitiones Arithmeticae',1801],['Gödels Unvollständigkeitssätze',1931],['Turings On Computable Numbers',1936]
], 'Gauss systematisierte unter anderem das Rechnen mit Restklassen und prägte damit die moderne Zahlentheorie. Turing untersuchte später, welche Probleme sich überhaupt mit einem allgemeinen Rechenverfahren lösen lassen.', 'MacTutor History of Mathematics · Chronology','https://mathshistory.st-andrews.ac.uk/Chronology/');
timeline('quantenphysik',3,'Quantenphysik','Publikationen und Entdeckungen am Beginn der Quantenphysik',[
  ['Plancks Strahlungsgesetz mit Energiequanten',1900],['Einsteins Lichtquanten-Arbeit',1905],['Schrödingers Veröffentlichungen zur Wellenmechanik',1926],['Chadwicks Nachweis des Neutrons',1932]
], 'Planck führte Energiequanten zunächst zur Beschreibung der Wärmestrahlung ein. Einstein übertrug die Quantisierung auf Licht und erklärte damit einen Effekt, den das reine Wellenbild nicht ausreichend beschrieb.', 'Nobel Prize · The Nobel Prize in Physics 1901–2000','https://www.nobelprize.org/prizes/themes/the-nobel-prize-in-physics-1901-2000/');
timeline('klimawissenschaft',3,'Klimaforschung','Schritte zum Verständnis des Treibhauseffekts',[
  ['Fouriers Überlegung zur wärmenden Wirkung der Atmosphäre',1824],['Tyndalls Messungen zur Absorption von Wärmestrahlung',1859],['Arrhenius’ Berechnung zum CO₂-Einfluss auf die Temperatur',1896],['Beginn der Keeling-CO₂-Messreihe auf Mauna Loa',1958]
], 'Die Grundidee des Treibhauseffekts ist wesentlich älter als moderne Computer. Die Keeling-Kurve zeigte dann mit präzisen fortlaufenden Messungen sowohl den Jahresgang als auch den langfristigen CO₂-Anstieg.', 'American Institute of Physics · Global Warming Timeline','https://history.aip.org/climate/timeline.htm');
timeline('internationale-institutionen',3,'Internationale Politik','Gründungen internationaler Organisationen',[
  ['Gründung des Internationalen Komitees vom Roten Kreuz',1863],['Gründung der Internationalen Arbeitsorganisation ILO',1919],['Inkrafttreten der UN-Charta',1945],['Gründung der Welthandelsorganisation WTO',1995]
], 'Die ILO entstand schon nach dem Ersten Weltkrieg und ist damit älter als die Vereinten Nationen. Die WTO ersetzte 1995 keine weltweite Handelslosigkeit, sondern baute auf dem früheren GATT-System auf.', 'Vereinte Nationen · History of the United Nations','https://www.un.org/en/about-us/history-of-the-un');
timeline('information-und-ki',3,'Informatik und KI','Publikationen und Treffen der frühen Informationswissenschaft',[
  ['Shannons A Mathematical Theory of Communication',1948],['Turings Computing Machinery and Intelligence',1950],['Watson und Cricks DNA-Strukturartikel',1953],['Dartmouth-Sommerworkshop zur künstlichen Intelligenz',1956]
], 'Shannon untersuchte, wie Information unabhängig von ihrer Bedeutung gemessen und übertragen werden kann. Der Dartmouth-Workshop prägte später den Forschungsbereich, der unter dem Namen künstliche Intelligenz bekannt wurde.', 'Computer History Museum · Artificial Intelligence and Robotics','https://www.computerhistory.org/timeline/ai-robotics/');
timeline('planetensonden',3,'Sonnensystem','Starttermine dieser Raumsonden',[
  ['Voyager 1',1977],['Magellan zur Venus',1989],['Cassini-Huygens zum Saturn',1997],['New Horizons zum Pluto',2006]
], 'Startjahr und Ankunftsjahr einer Sonde liegen oft weit auseinander: New Horizons erreichte Pluto erst 2015. Voyager 1 benötigte außerdem nicht nur Technik, sondern günstige Planetenstellungen für seine Route.', 'NASA Science · Voyager Fact Sheet','https://science.nasa.gov/mission/voyager/fact-sheet/');

export const timeQuestions = families.flatMap(family => ['earlier','later'].map(type => {
  const options = family.rows.map(([label,year],index) => ({
    id:`mss-time-${family.id}-${index+1}`, label, value:year,
    displayValue:String(year)
  }));
  const sorted=[...options].sort((a,b)=>a.value-b.value);
  const correct=type==='earlier'?sorted[0]:sorted.at(-1);
  return {
    id:`mss-time-${family.id}-${type}`, familyId:`mss-time-${family.id}`,
    type, category:family.category, difficulty:family.difficulty,
    prompt:`${family.subject[0].toUpperCase()+family.subject.slice(1)}: Was geschah ${type==='earlier'?'zuerst':'zuletzt'}?`,
    options, correctId:correct.id,
    explanation:`${correct.label}: ${correct.value}. ${family.insight}`,
    source:{...family.source}, basis:'curated',
    basisLabel:'Verglichen werden die ausdrücklich benannten Meilensteine.'
  };
}));
