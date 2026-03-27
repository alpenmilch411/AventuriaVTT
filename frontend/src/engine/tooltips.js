/**
 * DSA5 Entity Tooltip Descriptions — single source of truth.
 *
 * Short, beginner-friendly descriptions for special abilities, advantages,
 * and disadvantages. Used by CharacterSheet, PlayerOverview, CharacterViewer,
 * CharacterDetail, and ArmoryTab for tooltip display.
 *
 * These are UI summaries, not DB data. The DB holds full rule descriptions;
 * these are condensed one-liners optimized for quick tooltip display.
 */

// ── Special Ability descriptions ──
export const SF_TOOLTIPS = {
  // Combat — Maneuvers
  'Wuchtschlag I': '-1 AT, +1 TP. Mehr Schaden auf Kosten der Treffsicherheit.',
  'Wuchtschlag II': '-2 AT, +2 TP. Noch härter zuschlagen.',
  'Wuchtschlag III': '-3 AT, +3 TP. Maximaler Schaden, extrem schwer zu treffen.',
  'Finte I': '-1 AT, Gegner -1 PA. Hilft gegen gut gepanzerte Feinde.',
  'Finte II': '-2 AT, Gegner -2 PA. Sehr effektiv gegen gut gepanzerte Feinde.',
  'Finte III': '-3 AT, Gegner -3 PA. Meisterhafte Täuschung.',
  'Hammerschlag': '-4 AT, +4 TP, RS des Gegners halbiert. Gewaltiger Schlag.',
  'Todesstoß': '-8 AT, Schaden x2. Vernichtender Angriff, nur 1x pro Kampf.',
  'Niederwerfen': '-2 AT, bei Treffer KK-Vergleich — Gegner ist liegend.',
  'Ausfall': '-2 AT, dafür zählt deine Reichweite eine Stufe höher.',
  'Klingensturm': '-4 AT, 2 Angriffe gegen verschiedene Gegner. Keine PA in dieser KR.',
  'Windmühle': '-4 AT gegen alle Gegner in Nahkampfreichweite (max 3). Keine PA.',
  'Sturmangriff': '+2 AT bei 4+ Schritt Anlauf, -2 PA in dieser KR.',
  'Entwaffnen': '-4 AT, kein Schaden. KK-Vergleich: Gegner verliert Waffe.',
  'Gezielter Stich': '-4 AT, ignoriert 2 RS des Gegners.',
  'Meisterparade': 'Zweite Parade pro KR möglich, mit -4.',

  // Combat — Passive
  'Schildkampf I': '+1 PA mit Schild. Grundvoraussetzung für effektiven Schildeinsatz.',
  'Schildkampf II': '+2 PA mit Schild. Meister der Schildverteidigung.',
  'Rüstungsgewöhnung I': 'Behinderung (BE) der Rüstung -1.',
  'Rüstungsgewöhnung II': 'BE -2. Bewegt sich in Rüstung fast frei.',
  'Verbessertes Ausweichen I': '+2 Ausweichen. Gut für Kämpfer ohne Schild.',
  'Verbessertes Ausweichen II': '+4 Ausweichen. Weicht Angriffen meisterhaft aus.',
  'Kampfreflexe': '+2 Initiative, immun gegen Überraschung.',
  'Kampfgespür': '+1 Parade, +1 Ausweichen. Allgemeiner Verteidigungsbonus.',
  'Beidhändiger Kampf I': 'Zusatzangriff Nebenhand (-4 AT).',
  'Beidhändiger Kampf II': 'Nebenhand nur -2 AT. Fast so gut wie Haupthand.',

  // Ranged
  'Scharfschütze': 'Distanzabzüge -2. Nah und Mittel ohne Malus.',
  'Schnellladen (Bogen)': 'Bogen laden als freie Aktion. Schuss jede Runde möglich.',
  'Präziser Schuss I': '-4 FK, +2 TP. Gezielter Schuss für mehr Schaden.',
  'Schnellschuss': '2 Schüsse pro KR, jeweils -4 FK.',

  // Magic
  'Tradition (Gildenmagie)': 'Gildenmagier-Zauber lernen und wirken.',
  'Tradition (Perainekirche)': 'Peraine-Liturgien wirken (Heilung, Segen, Schutz).',
  'Zauber verbreiten': 'Zauber auf mehrere Ziele gleichzeitig (mehr AsP).',
  'Kraftkontrolle': 'Zauberkosten -1 AsP.',
  'Astrale Meditation': 'LeP in AsP umwandeln (1:1).',
  'Magische Regeneration I': '+1 AsP/Regeneration.',
  'Fernzauber': 'Vergrößert die Reichweite von Zaubern.',

  // Karma
  'Liturgiestil (Peraine)': 'Bonus auf Heilungs-Liturgien.',
  'Karmale Meditation': 'Verzicht auf LeP-Regen, +1W6 KaP.',
  'Karmale Regeneration I': '+1 KaP/Regeneration.',

  // General
  'Ortskenntnis': '+1 auf Gassenwissen/Orientierung am Ort.',
  'Geländekunde': '+1 auf Fährtensuchen/Orientierung/Pflanzenkunde im Gelände.',
  'Athlet': 'Körperbeherrschung/Kraftakt +1 QS.',
  'Nerven aus Stahl': 'Willenskraft gegen Einschüchtern +1 QS.',
  'Fallen entschärfen': 'Schlösserknacken für Fallen.',
}

// ── Advantage descriptions ──
export const ADV_TOOLTIPS = {
  'Zäher Hund': '+1 gegen Schmerz, länger stabil bei Bewusstlosigkeit.',
  'Hohe Zähigkeit': '+1 Zähigkeit (ZK). Besser gegen Gift, Krankheiten.',
  'Gutaussehend': '+1 auf Proben mit Aussehen.',
  'Zauberer': 'Kann Zauber wirken, hat Astralpunkte (AsP).',
  'Geweihter': 'Kann Liturgien wirken, hat Karmapunkte (KaP).',
  'Fuchssinn': '+1 Sinnesschärfe.',
  'Dunkelsicht': 'Kein Malus bei Dämmerung, nur -1 bei Dunkelheit.',
  'Hohe Karmalkraft I': '+15 KaP Maximum.',
  'Hohe Lebenskraft': '+LeP Maximum.',
  'Hohe Astralkraft': '+AsP Maximum.',
  'Hohe Karmalkraft': '+KaP Maximum.',
  'Glück': '+1 SchiP pro Stufe.',
  'Eisern': '+1 auf Proben gegen Furcht.',
  'Geborener Krieger': '+1 auf AT-Proben.',
  'Flink': '+1 GS pro Stufe.',
  'Waffenbegabung': '+1 AT/PA mit einer gewählten Waffe.',
  'Hohe Seelenkraft': '+1 SK.',
  'Verbesserte Regeneration': '+1 auf Regeneration.',
  'Schwer zu verzaubern': '+2 SK gegen Zauber.',
}

// ── Disadvantage descriptions ──
export const DISADV_TOOLTIPS = {
  'Jähzorn': 'Bei Provokation: Selbstbeherrschung oder blinder Angriff.',
  'Goldgier': 'Selbstbeherrschung nötig gegen Schätze.',
  'Neugier': 'Kann Geheimnisse nicht ignorieren.',
  'Prinzipientreue': 'Muss Prinzipien folgen, auch wenn nachteilig.',
  'Mitleid': 'Muss Leidenden helfen, auch wenn gefährlich.',
  'Platzangst': 'Enge Räume: Furcht 1.',
  'Angst': 'Zustand Furcht in bestimmten Situationen.',
  'Blutrausch': 'Bei Kampf Selbstbeherrschung oder unkontrollierter Angriff.',
  'Niedrige Lebenskraft': '-LeP Maximum.',
  'Niedrige Astralkraft': '-AsP Maximum.',
  'Niedrige Karmalkraft': '-KaP Maximum.',
  'Pech': '-1 SchiP pro Stufe.',
  'Niedrige Seelenkraft': '-1 SK.',
  'Niedrige Zähigkeit': '-1 ZK.',
  'Lahm': '-1 GS.',
  'Nachtblind': '-3 bei Dunkelheit statt -1.',
  'Körperliche Auffälligkeit (spitze Ohren)': 'Elfische Ohren fallen auf, können Misstrauen erregen.',
}
