import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'

// ---------------------------------------------------------------------------
// DSA5 abbreviation + KPI glossary
// ---------------------------------------------------------------------------

export const TOOLTIPS = {
  AT:    { full: 'Attackewert',         desc: 'Basiswert für Angriffe im Nahkampf.',                                    formula: 'Kampftechnik-FW ÷ 2 + Waffe AT-Mod',     applied: 'Angriffsproben; Manöver wie Wuchtschlag/Finte modifizieren ihn' },
  PA:    { full: 'Paradewert',           desc: 'Basiswert für Paraden im Nahkampf.',                                    formula: 'Kampftechnik-FW ÷ 2 + Waffe PA-Mod',     applied: 'Paradeproben; jede Extra-Reaktion kostet 1 SchiP (kumulativ −3)' },
  FK:    { full: 'Fernkampfwert',        desc: 'Basiswert für Fernkampfangriffe.',                                      formula: 'Kampftechnik-FW + FK-Mod',                applied: 'Fernkampfproben; Entfernungsstufe beeinflusst Malus' },
  TP:    { full: 'Trefferpunkte',        desc: 'Schaden bei einem erfolgreichen Treffer, bevor Rüstung abgezogen wird.',formula: 'Waffenwürfel + Bonus + KK-Bonus',         applied: 'SP = TP − RS des Ziels; bei ≥5 SP: Wundenprobe des Ziels' },
  SP:    { full: 'Schadenspunkte',       desc: 'Tatsächlich erlittener Schaden nach Rüstungsabzug.',                   formula: 'TP − RS (mind. 0)',                       applied: 'Zieht LeP des Ziels ab; Basis für Wunden' },
  LeP:   { full: 'Lebenspunkte',         desc: 'Vitalität — sinkt bei Schaden, auf 0 bewusstlos, auf −LeP tot.',       formula: 'KO × 2 + KK',                            applied: 'Unter Hälfte: erschöpft-ähnliche Effekte; unter 0: bewusstlos/sterbend' },
  AsP:   { full: 'Astralpunkte',         desc: 'Magische Energie für Zauberwirken.',                                   formula: 'MU + IN + CH',                            applied: 'Werden bei Zaubern abgezogen; bei 0 kann nicht mehr gezaubert werden' },
  KaP:   { full: 'Karmapunkte',          desc: 'Göttliche Energie für Liturgien.',                                     formula: 'MU + KL + IN',                            applied: 'Werden bei Liturgien abgezogen; regenerieren durch Gebet' },
  RS:    { full: 'Rüstungsschutz',       desc: 'Schutzwert der Rüstung — reduziert TP zu SP.',                        formula: 'Summe aller angelegten Rüstungen',        applied: 'SP = TP − RS; überlagert sich NICHT (höchster RS gilt bei Zonensystem)' },
  BE:    { full: 'Behinderung',          desc: 'Bewegungseinschränkung durch Rüstung.',                                formula: 'Summe Rüstungs-BE − Abzüge durch SF',    applied: 'Abzug auf AT, PA, GS, körperliche Talente (Klettern, Schwimmen …)' },
  GS:    { full: 'Geschwindigkeit',      desc: 'Schritt pro Bewegungsaktion im Kampf.',                                formula: 'GE − BE',                                applied: '1 Bewegungsaktion = GS Schritt; Umrunden, Rückzug' },
  INI:   { full: 'Initiative',           desc: 'Bestimmt die Handlungsreihenfolge zu Beginn jeder Kampfrunde.',        formula: 'MU + GE ÷ 2 + INI_basis + 1W6',         applied: 'Absteigend auflösen; bei Gleichstand: höheres MU entscheidet' },
  AW:    { full: 'Ausweichen',           desc: 'Reaktionswert: Ausweichen statt Parieren.',                            formula: 'GE ÷ 2',                                 applied: 'Alternative zu PA; erste Reaktion kostet kein SchiP' },
  SK:    { full: 'Seelenkraft',          desc: 'Widerstand gegen mentale und magische Angriffe.',                      formula: 'MU + KL + IN − 10',                      applied: 'Gegenwert bei geistigen Zaubern, Beherrschungs-Liturgien' },
  ZK:    { full: 'Zähigkeit',            desc: 'Widerstand gegen körperliche Sondereffekte.',                         formula: 'KO + KO + KK − 10',                      applied: 'Gegenwert bei Vergiftungen, körperlichen Zaubern' },
  SchiP: { full: 'Schicksalspunkte',     desc: 'Glückspunkte für Extrareaktionen oder Würfelwurf-Wiederholungen.',    formula: '3 pro Begegnung (Standard)',             applied: 'Zusatzreaktion nach genutzter PA/AW; kumulativ −3 für jede weitere' },
  MR:    { full: 'Magieresistenz',       desc: 'Widerstand gegen Zaubereffekte.',                                      formula: 'SK + Modifikatoren',                      applied: 'Gegenwert bei Zaubern, die explizit MR prüfen' },
  QS:    { full: 'Qualitätsstufe',       desc: 'Erfolgsgrad einer Probe (1–6).',                                       formula: 'Verbleibende Punkte ÷ 3 (aufger.)',       applied: 'Stärkt Heilzauber, Talent-Qualität, Wirkungsgrad von Liturgien' },
  FW:    { full: 'Fertigkeitswert',      desc: 'Stufe einer Kampftechnik oder eines Talents.',                         formula: 'Startpunkte + bezahlte Steigerungen',    applied: 'Grundlage für AT/PA/FK-Berechnung; Talentproben' },
  AP:    { full: 'Abenteuerpunkte',      desc: 'Erfahrungspunkte zum Verbessern von Werten.',                          formula: 'GM-Vergabe nach Szenen und Abenteuern',  applied: 'Kauf von SF, Talenten, Attributsteigerungen' },
  KR:    { full: 'Kampfrunde',           desc: 'Zeiteinheit im Kampf (ca. 3 Sekunden).',                               formula: '1 KR = 1 Aktion + evtl. Reaktion(en)',   applied: 'Zauberdauer, Wirkungsdauer, Ladezeiten von Fernkampfwaffen' },
  RW:    { full: 'Reichweite',           desc: 'Effektive Länge der Waffe im Nahkampf.',                               formula: 'kurz / mittel / lang',                   applied: 'Kürzere Waffe −2 AT vs. längere; Grappling-Vorteil mit kurzen' },
  SF:    { full: 'Sonderfertigkeit',     desc: 'Erlernte Spezialfähigkeit oder Kampfmanöver.',                         formula: 'AP-Kauf aus SF-Kategorie',               applied: 'Erlaubt Manöver (Wuchtschlag, Finte …) ohne Malus oder überhaupt erst' },
  MU:    { full: 'Mut',                  desc: 'Tapferkeit, Angriffslust, mentale Stärke.',                            formula: 'Basisattribut',                          applied: 'INI, SK, Angriffsproben, Zauberproben' },
  KL:    { full: 'Klugheit',             desc: 'Intelligenz, Lernfähigkeit, Gedächtnis.',                              formula: 'Basisattribut',                          applied: 'Wissensproben, Zauberproben, Alchemie' },
  IN:    { full: 'Intuition',            desc: 'Wahrnehmung, Menschenkenntnis, Reaktion.',                             formula: 'Basisattribut',                          applied: 'Wahrnehmungsproben, INI, Zauberproben' },
  CH:    { full: 'Charisma',             desc: 'Überzeugungskraft, Ausstrahlung, Führung.',                            formula: 'Basisattribut',                          applied: 'Gesellschaftsproben, AsP-Berechnung' },
  FF:    { full: 'Fingerfertigkeit',     desc: 'Präzision der Hände, Feinmotorik.',                                    formula: 'Basisattribut',                          applied: 'Handwerksproben, Taschendiebstahl, FK-Waffen' },
  GE:    { full: 'Gewandtheit',          desc: 'Körperliche Beweglichkeit und Schnelligkeit.',                         formula: 'Basisattribut',                          applied: 'GS, AW, Körperproben (Klettern, Akrobatik, Schleichen)' },
  KO:    { full: 'Konstitution',         desc: 'Gesundheit, Zähigkeit, Ausdauer.',                                     formula: 'Basisattribut',                          applied: 'LeP, ZK, Ausdauerproben, Wundenproben' },
  KK:    { full: 'Körperkraft',          desc: 'Physische Stärke und Tragvermögen.',                                   formula: 'Basisattribut',                          applied: 'TP-Bonus, LeP, Kraftproben (Schleppen, Rammen)' },
  KT:    { full: 'Kampftechnik',         desc: 'Fertigkeitswert einer Waffengattung (z.B. Schwerter, Bögen).',        formula: 'Basiswert + Steigerungen',               applied: 'Grundlage für AT/PA/FK-Berechnung; bestimmt Kampfeffektivität' },
  WS:    { full: 'Wundschwelle',         desc: 'Ab dieser SP-Zahl erleidet das Ziel eine Wunde.',                     formula: 'KO ÷ 2',                                 applied: 'Bei SP ≥ WS: Wundenprobe (KO), bei Misslingen: Wundeffekt' },
  SB:    { full: 'Schadensbonus',        desc: 'Zusätzlicher Schaden durch hohe Körperkraft.',                        formula: 'KK − 15 (mind. 0)',                      applied: 'Wird auf TP im Nahkampf addiert, wenn KK hoch genug' },
}

// ---------------------------------------------------------------------------
// Tooltip component — portal-based to escape scroll containers
// ---------------------------------------------------------------------------

export function Tooltip({ children, term }) {
  const [pos, setPos] = useState(null)
  const ref = useRef(null)
  const tip = TOOLTIPS[term]
  if (!tip) return <>{children}</>

  const show = () => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({ top: r.top, cx: r.left + r.width / 2 })
  }

  const tooltip = pos && createPortal(
    <div
      style={{ position: 'fixed', top: pos.top - 10, left: pos.cx, transform: 'translate(-50%, -100%)', zIndex: 9999 }}
      className="w-64 bg-dsa-bg-card border border-dsa-gold/40 rounded-xl p-3 shadow-2xl shadow-black/70 pointer-events-none"
    >
      <div className="text-xs font-bold text-dsa-gold mb-1">{term} — {tip.full}</div>
      <p className="text-xs text-dsa-parchment leading-relaxed mb-2">{tip.desc}</p>
      {tip.formula && (
        <div className="text-[10px] font-mono bg-dsa-bg px-2 py-1 rounded text-dsa-parchment-dark/80 mb-1.5 border border-dsa-bg-medium">
          = {tip.formula}
        </div>
      )}
      {tip.applied && (
        <p className="text-[10px] text-dsa-parchment-dark/60 italic leading-relaxed">↪ {tip.applied}</p>
      )}
      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-dsa-gold/40" />
    </div>,
    document.body
  )

  return (
    <>
      <span ref={ref} onMouseEnter={show} onMouseLeave={() => setPos(null)} className="cursor-help">
        {children}
      </span>
      {tooltip}
    </>
  )
}

// Underlined abbreviation with hover tooltip — use inside stat chips, labels, etc.
export function TipAbbr({ term, className = '' }) {
  return (
    <Tooltip term={term}>
      <span className={className}>{term}</span>
    </Tooltip>
  )
}

// Info icon next to a form label — appears when field has a tooltip term
export function TipIcon({ term }) {
  const [pos, setPos] = useState(null)
  const ref = useRef(null)
  const tip = TOOLTIPS[term]
  if (!tip) return null

  const show = () => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({ top: r.top, cx: r.left + r.width / 2 })
  }

  const tooltip = pos && createPortal(
    <div
      style={{ position: 'fixed', top: pos.top - 10, left: pos.cx, transform: 'translate(-50%, -100%)', zIndex: 9999 }}
      className="w-64 bg-dsa-bg-card border border-dsa-gold/40 rounded-xl p-3 shadow-2xl shadow-black/70 pointer-events-none"
    >
      <div className="text-xs font-bold text-dsa-gold mb-1">{term} — {tip.full}</div>
      <p className="text-xs text-dsa-parchment leading-relaxed mb-2">{tip.desc}</p>
      {tip.formula && (
        <div className="text-[10px] font-mono bg-dsa-bg px-2 py-1 rounded text-dsa-parchment-dark/80 mb-1.5 border border-dsa-bg-medium">
          = {tip.formula}
        </div>
      )}
      {tip.applied && (
        <p className="text-[10px] text-dsa-parchment-dark/60 italic leading-relaxed">↪ {tip.applied}</p>
      )}
      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-dsa-gold/40" />
    </div>,
    document.body
  )

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={() => setPos(null)}
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-dsa-bg-medium border border-dsa-bg-medium text-dsa-parchment-dark/50 hover:text-dsa-gold hover:border-dsa-gold/40 transition-colors cursor-help text-[8px] font-bold ml-1 align-middle"
      >
        ?
      </span>
      {tooltip}
    </>
  )
}
