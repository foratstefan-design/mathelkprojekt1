// Vier Antworttypen, jeweils 20 unterschiedliche Vierergruppen. Häufigkeiten
// stammen aus den bezeichneten Messungen, niemals aus erfundenen Spielerdaten.
// Quellen und Werte sind serverseitig; der Client erhält sie erst nach der Wahl.
const percentage = number => number.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' %';
function options(prefix, rows, asPercent = false) {
  return rows.map(([id, label, value]) => ({ id: prefix + '-' + id, label, value,
    displayValue: asPercent ? percentage(value) : String(value) }));
}
const groups = [
  {
    id: 'code', category: 'Technik-Nutzung', types: ['common','rare'], basis: 'measured',
    basisLabel: 'Stack Overflow 2024 · alle Befragten · Mehrfachnennungen',
    prompts: {
      common: 'Welche dieser Technologien wurde am häufigsten genutzt?',
      rare: 'Welche dieser Technologien wurde am seltensten genutzt?'
    },
    detail: 'Anteil unter 60.171 Antworten auf die Nutzungsfrage im Developer Survey 2024, „All Respondents“. Gefragt wurde nach umfangreicher Nutzung im vergangenen Jahr; Mehrfachnennungen waren möglich. Die Auswahl ist keine Aussage über alle Menschen.',
    source: { title: 'Stack Overflow / Stack Exchange Inc. · Developer Survey 2024 (ODbL 1.0)', url: 'https://survey.stackoverflow.co/2024/technology/#most-popular-technologies-language' },
    options: options('code', [
      ['javascript','JavaScript',62.3], ['html-css','HTML/CSS',52.9], ['python','Python',51.0], ['typescript','TypeScript',38.5],
      ['shell','Bash/Shell',33.9], ['java','Java',30.3], ['csharp','C#',27.1], ['cpp','C++',23.0],
      ['c','C',20.3], ['php','PHP',18.2], ['powershell','PowerShell',13.8], ['go','Go',13.5]
    ], true)
  },
  {
    id: 'namen', category: 'Vornamen', types: ['common','rare'], basis: 'measured',
    basisLabel: 'GfdS 2023 · Deutschland · Jungen-Erstnamen mit Schreibvarianten',
    prompts: {
      common: 'Welcher dieser Jungennamen wurde am häufigsten vergeben?',
      rare: 'Welcher dieser Jungennamen wurde am seltensten vergeben?'
    },
    detail: 'Verglichen wird nur diese Auswahl aus der GfdS-Erstnamenliste 2023 für Jungen in Deutschland. Lautgleiche Schreibvarianten sind gebündelt. Die Prozentwerte aus der Erstnamentabelle beziehen sich laut Quellenfußnote auf alle vergebenen männlichen Vornamen, nicht auf alle Geburten; rund 750 Standesämter lieferten Daten.',
    source: { title: 'Gesellschaft für deutsche Sprache · Die beliebtesten Vornamen 2023', url: 'https://gfds.de/die-beliebtesten-vornamen-2023/' },
    options: options('namen', [
      ['noah','Noah',1.39], ['matheo','Matt(h)eo / Mat(h)eo',1.27], ['leon','Leon',1.14], ['paul','Paul',1.08],
      ['emil','Emil',1.06], ['luca','Luca / Luka',1.05], ['henry','Henry / Henri',1.02], ['louis','Louis / Luis',1.01]
    ], true)
  },
  {
    id: 'computer', category: 'Computergeschichte', types: ['earlier','later'], basis: 'curated',
    basisLabel: 'Belegte Meilensteine · Computer History Museum',
    prompts: {
      earlier: 'Welcher Meilenstein geschah zuerst?',
      later: 'Welcher Meilenstein geschah zuletzt?'
    },
    detail: 'Verglichen werden die im Antworttext genau genannten Ereignisse, nicht pauschale Erfindungsjahre oder eine spätere Markteinführung.',
    source: { title: 'Computer History Museum · Timeline of Computer History', url: 'https://www.computerhistory.org/timeline/computers/' },
    options: options('computer', [
      ['z3','Zuses Z3 fertiggestellt',1941], ['colossus','Erster Colossus betriebsbereit',1944], ['eniac','ENIAC öffentlich vorgestellt',1946],
      ['baby','Manchester „Baby“: erstes Programm',1948], ['edsac','EDSAC fertiggestellt',1949], ['pilot-ace','Pilot ACE fertiggestellt',1950],
      ['system-360','IBM kündigt System/360 an',1964], ['altair','Altair 8800: Magazin-Titelgeschichte',1975],
      ['apple-1','Wozniak stellt Apple-1 fertig',1976], ['apple-2','Apple II vorgestellt',1977],
      ['ibm-pc','IBM PC vorgestellt',1981], ['macintosh','Apple Macintosh vorgestellt',1984]
    ])
  },
  {
    id: 'olympia', category: 'Olympische Geschichte', types: ['earlier','later'], basis: 'curated',
    basisLabel: 'Erstmalige Austragung · Olympische Sommerspiele',
    prompts: {
      earlier: 'Welche Stadt hatte ihr Sommerolympia-Debüt zuerst?',
      later: 'Welche Stadt hatte ihr Sommerolympia-Debüt zuletzt?'
    },
    detail: 'Es zählt die erste Austragung Olympischer Sommerspiele der Neuzeit in der jeweiligen Stadt. Spätere Austragungen derselben Stadt ändern den Vergleich nicht.',
    source: { title: 'Griechisches Olympisches Komitee · Geschichte der Olympischen Spiele', url: 'https://www.hoc.gr/en/olympic-games-history/' },
    options: options('olympia', [
      ['athen','Athen',1896], ['paris','Paris',1900], ['st-louis','St. Louis',1904], ['stockholm','Stockholm',1912],
      ['antwerpen','Antwerpen',1920], ['amsterdam','Amsterdam',1928], ['berlin','Berlin',1936], ['helsinki','Helsinki',1952],
      ['rom','Rom',1960], ['mexiko-stadt','Mexiko-Stadt',1968], ['muenchen','München',1972], ['barcelona','Barcelona',1992]
    ])
  }
];

// Distinct sets use all items across the pool, rather than repeating the same
// four cards under different IDs. Tied published percentages are left out.
const twelveSets = [[0,3,6,9],[1,4,7,10],[2,5,8,11],[0,4,8,10],[1,5,6,11],[2,3,7,9],[0,2,5,11],[1,3,8,9],[2,4,6,10],[3,5,7,11]];
const eightSets = [[0,1,2,3],[4,5,6,7],[0,2,4,6],[1,3,5,7],[0,3,6,7],[1,2,4,5],[0,1,4,7],[2,3,5,6],[0,2,5,7],[1,3,4,6]];
export const legacyQuestions = groups.flatMap(group => group.types.flatMap(type => {
  const sets = group.options.length === 8 ? eightSets : twelveSets;
  return sets.map((indexes,index) => {
    const choices = indexes.map(itemIndex => ({ ...group.options[itemIndex] }));
    const sorted = [...choices].sort((a,b) => a.value-b.value);
    const correct = type === 'common' || type === 'later' ? sorted.at(-1) : sorted[0];
    const comparison = type === 'common' ? 'höchsten Anteil' : type === 'rare' ? 'niedrigsten Anteil' : type === 'earlier' ? 'frühesten Zeitpunkt' : 'spätesten Zeitpunkt';
    return { id: group.id + '-' + type + '-' + (index+1), type, category: group.category,
      prompt: group.prompts[type], options: choices, correctId: correct.id,
      explanation: `${correct.label} hat in dieser Auswahl den ${comparison}: ${correct.displayValue}. ${group.detail}`,
      source: { ...group.source }, basis: group.basis, basisLabel: group.basisLabel };
  });
}));
