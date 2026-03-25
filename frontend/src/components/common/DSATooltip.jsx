import { useState } from 'react'
import clsx from 'clsx'

const GLOSSARY = {
  AT: 'Attacke-Wert — Wuerfle 1W20, Ergebnis muss ≤ AT sein fuer einen Treffer.',
  PA: 'Parade-Wert — Verteidigung mit der Waffe. 1W20 ≤ PA = Angriff abgewehrt.',
  AW: 'Ausweichen-Wert — Dem Angriff ausweichen. 1W20 ≤ AW = Ausgewichen.',
  RS: 'Ruestungsschutz — Wird vom Schaden abgezogen. RS 3 bedeutet 3 weniger Schaden.',
  TP: 'Trefferpunkte — Der Schaden, den eine Waffe verursacht (z.B. 1W6+4).',
  SP: 'Schadenspunkte — Tatsaechlicher Schaden nach Abzug von RS.',
  LeP: 'Lebenspunkte — Deine Gesundheit. Bei 0 bist du bewusstlos.',
  AsP: 'Astralpunkte — Magische Energie fuer Zauber. Regeneriert bei Rast.',
  KaP: 'Karmapunkte — Goettliche Energie fuer Liturgien. Regeneriert bei Gebet.',
  FW: 'Fertigkeitswert — Wie gut du ein Talent/Zauber beherrschst. Gleicht Fehlpunkte aus.',
  QS: 'Qualitaetsstufe — Wie gut ein Wurf gelungen ist. QS 1 = knapp, QS 6 = meisterhaft.',
  INI: 'Initiative — Bestimmt die Reihenfolge im Kampf. Hoeher = frueher dran.',
  GS: 'Geschwindigkeit — Wie viele Schritt du pro Kampfrunde laufen kannst.',
  SK: 'Seelenkraft — Widerstand gegen magische/geistige Effekte.',
  ZK: 'Zaehigkeit — Widerstand gegen Gift, Krankheit, koerperliche Effekte.',
  BE: 'Behinderung — Malus durch schwere Ruestung auf koerperliche Proben.',
  MU: 'Mut — Fuer Willenskraft, Furchtresistenz, Kampfbereitschaft.',
  KL: 'Klugheit — Fuer Wissen, Analyse, magische Proben.',
  IN: 'Intuition — Fuer Wahrnehmung, Instinkt, soziale Situationen.',
  CH: 'Charisma — Fuer Ueberzeugung, Ausstrahlung, goettliche Proben.',
  FF: 'Fingerfertigkeit — Fuer Geschicklichkeit, Handwerk, Praezision.',
  GE: 'Gewandtheit — Fuer Koerperbeherrschung, Ausweichen, Akrobatik.',
  KO: 'Konstitution — Fuer Ausdauer, Zaehigkeit, Giftresistenz.',
  KK: 'Koerperkraft — Fuer Staerke, Kraftakte, Nahkampfschaden.',
  SchiP: 'Schicksalspunkte — Einmal pro Wurf einsetzbar: Wurf wiederholen oder +1 FW.',
}

/**
 * Wraps text with a hover tooltip explaining the DSA5 term.
 * Usage: <DSATooltip term="AT">AT 14</DSATooltip>
 */
export default function DSATooltip({ term, children, className }) {
  const [show, setShow] = useState(false)
  const desc = GLOSSARY[term]
  if (!desc) return <span className={className}>{children}</span>

  return (
    <span
      className={clsx('relative cursor-help border-b border-dotted border-dsa-parchment-dark/30', className)}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1.5 bg-dsa-bg-card border border-dsa-gold/20 rounded-sm shadow-xl text-[9px] text-dsa-parchment whitespace-normal w-48 text-center pointer-events-none">
          <span className="font-bold text-dsa-gold">{term}</span>: {desc}
        </span>
      )}
    </span>
  )
}

/**
 * Export glossary for use in other components.
 */
export { GLOSSARY }
