import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Shield, Swords, Heart, Sparkles, Star,
  Package, ScrollText, Award, Info, X, ChevronDown, ChevronUp
} from 'lucide-react'
import useAuthStore from '../../stores/authStore'
import ProgressBar from '../../components/common/ProgressBar'
import Badge from '../../components/common/Badge'

// ── Comprehensive DSA5 explanations ──

const ATTR_INFO = {
  MU: { name: 'Mut', desc: 'Bestimmt Tapferkeit, Willenskraft und Entschlossenheit. Wichtig für Kampf, Magie und Selbstbeherrschung. Beeinflusst viele Kampfproben und Zauber.' },
  KL: { name: 'Klugheit', desc: 'Steht für logisches Denken, Wissen und Lernfähigkeit. Zentral für Wissenstalente, Magie und viele Handwerksproben.' },
  IN: { name: 'Intuition', desc: 'Bauchgefühl, Wahrnehmung und Menschenkenntnis. Wichtig für Sinnesschärfe, Fährtensuchen und soziale Proben.' },
  CH: { name: 'Charisma', desc: 'Ausstrahlung, Überzeugungskraft und persönliche Anziehung. Entscheidend für Überreden, Betören und viele Zauber.' },
  FF: { name: 'Fingerfertigkeit', desc: 'Feinmotorik und Geschicklichkeit der Hände. Wichtig für Schlösserknacken, Taschendiebstahl und Handwerksproben.' },
  GE: { name: 'Gewandtheit', desc: 'Körperliche Beweglichkeit und Reaktionsschnelligkeit. Beeinflusst Ausweichen (AW), Körperbeherrschung und Schleichen.' },
  KO: { name: 'Konstitution', desc: 'Körperliche Widerstandskraft und Ausdauer. Bestimmt Lebensenergie (LeP), Zähigkeit (ZK) und Regeneration.' },
  KK: { name: 'Körperkraft', desc: 'Reine Muskelkraft. Beeinflusst Nahkampfschaden, Tragkraft (KK x 2 Stein) und körperliche Proben wie Klettern und Kraftakt.' },
}

const DERIVED_INFO = {
  LeP: 'Lebenspunkte — Wie viel Schaden dein Held aushalten kann. Bei 0 bist du bewusstlos, bei negativem KO-Wert tot. Regeneriert bei Rast.',
  AsP: 'Astralpunkte — Magische Energie für Zaubersprüche. Nur Zauberer haben AsP. Jeder Zauber verbraucht AsP. Regeneriert bei Rast.',
  KaP: 'Karmapunkte — Göttliche Energie für Liturgien. Nur Geweihte haben KaP. Jede Liturgie verbraucht KaP. Regeneriert bei Rast.',
  GS: 'Geschwindigkeit — Wie viele Schritt (1 Schritt = 1 Meter) sich dein Held pro Kampfrunde bewegen kann. Wird durch Belastung und Zustände reduziert.',
  INI: 'Initiative-Basiswert — Bestimmt die Reihenfolge im Kampf. Zu Kampfbeginn würfelt jeder +1W6 dazu. Höherer Wert handelt zuerst.',
  AW: 'Ausweichen — Verteidigungswert ohne Waffe/Schild. Wird mit 1W20 geprobt (Wurf muss <= AW sein). Alternative zur Parade.',
  SK: 'Seelenkraft — Widerstand gegen Magie die den Geist angreift (z.B. Beherrschung, Furcht). Wird als Erschwernis auf feindliche Zauberproben addiert.',
  ZK: 'Zähigkeit — Widerstand gegen körperliche Magie und Effekte (z.B. Gift, Krankheit, Verwandlung). Wird als Erschwernis addiert.',
  Schip: 'Schicksalspunkte — Glückspunkte die dein Held einsetzen kann: Probe wiederholen, Schaden halbieren, +4 auf Verteidigung, oder einen Zustand 1 Runde ignorieren. Sehr wertvoll, setze sie weise ein!',
}

const COMBAT_INFO = {
  AT: 'Attacke — Angriffswert der Waffe. Würfle 1W20, Ergebnis muss <= AT sein für einen Treffer. Wird durch Manöver und Zustände modifiziert.',
  PA: 'Parade — Verteidigungswert mit dieser Waffe/Schild. Würfle 1W20, Ergebnis muss <= PA sein um einen Angriff abzuwehren. 1. Parade pro Runde ohne Abzug, jede weitere -3.',
  TP: 'Trefferpunkte — Schadenswürfel der Waffe (z.B. 1W6+4). Bei einem Treffer würfeln, dann wird die Rüstung (RS) des Ziels abgezogen.',
  RS: 'Rüstungsschutz — Wird von jedem erlittenen Schaden abgezogen. RS 4 bedeutet: jeder Treffer macht 4 Punkte weniger Schaden.',
  BE: 'Behinderung — Malus durch schwere Rüstung. Reduziert GS, INI und körperliche Proben. BE 3 = -3 auf viele Werte.',
  RW: 'Reichweite — Waffenreichweite: kurz (Dolch), mittel (Schwert), lang (Speer). Bestimmt aus welcher Entfernung angegriffen werden kann.',
}

const ADVANTAGE_INFO = {
  'Zäher Hund': 'Dein Held bleibt bei Bewusstlosigkeit länger stabil und erhält +1 auf Proben gegen Schmerz-Zustände.',
  'Hohe Zähigkeit': 'Erhöhte Zähigkeit (ZK) +1. Besser gegen Gift, Krankheiten und körperliche Magie.',
  'Gutaussehend': '+1 auf alle Proben die mit Aussehen zu tun haben (Betören, Überreden in sozialen Situationen).',
  'Zauberer': 'Dein Held kann Zauber wirken und hat Astralpunkte (AsP). Voraussetzung für alle magischen Fähigkeiten.',
  'Geweihter': 'Dein Held ist ein Geweihter einer Gottheit und kann Liturgien wirken. Hat Karmapunkte (KaP).',
  'Fuchssinn': '+1 auf Sinnesschärfe-Proben. Dein Held bemerkt Details die andere übersehen.',
  'Dunkelsicht': 'Kann bei Dämmerung ohne Malus sehen. In Dunkelheit nur -1 statt -3.',
  'Hohe Karmalkraft I': '+15 KaP-Maximum. Mehr göttliche Energie für Liturgien.',
}

const DISADVANTAGE_INFO = {
  'Jähzorn': 'Bei Provokation muss eine Selbstbeherrschung-Probe bestanden werden, sonst greift der Held blind an. Erschwert diplomatische Lösungen.',
  'Goldgier': 'Der Held kann Schätzen schwer widerstehen. Selbstbeherrschung-Probe nötig um Gold/Edelsteine nicht an sich zu nehmen.',
  'Neugier': 'Der Held kann Geheimnisse und Rätsel nicht ignorieren. Selbstbeherrschung nötig um von einem Mysterium abzulassen.',
  'Körperliche Auffälligkeit (spitze Ohren)': 'Die elfischen Ohren fallen auf und können in manchen Regionen Aventuriens Misstrauen erregen.',
  'Prinzipientreue': 'Der Held muss seinen Prinzipien treu bleiben, auch wenn es nachteilig ist. Bei Verletzung der Prinzipien: schlechtes Gewissen und Malus.',
  'Mitleid': 'Kann Leid nicht ignorieren. Muss helfen, auch wenn es gefährlich oder taktisch unklug ist.',
  'Platzangst': 'In engen Räumen (Höhlen, Kerker) erhält der Held den Zustand Furcht 1. Kann durch Selbstbeherrschung unterdrückt werden.',
}

const SF_INFO = {
  'Wuchtschlag I': 'Manöver: -2 auf AT, aber +2 TP bei Treffer. Macht mehr Schaden auf Kosten der Treffsicherheit. Basismanöver — verfügbar für alle, aber ohne diese SF nochmal -2 auf AT.',
  'Wuchtschlag II': 'Wie Wuchtschlag I, aber -4 auf AT und +4 TP. Für Kämpfer die sicher treffen können.',
  'Wuchtschlag III': '-6 auf AT, +6 TP. Maximaler Schaden, extrem schwer zu treffen.',
  'Finte I': 'Manöver: -1 auf AT, aber der Gegner erhält -2 auf Parade. Hilft gegen gut gepanzerte Feinde.',
  'Schildkampf I': 'Erlaubt es, den Schild aktiv zur Parade einzusetzen. Gibt +1 PA mit Schild. Ohne diese SF kann ein Schild nur passiv schützen.',
  'Schildkampf II': '+2 PA mit Schild statt +1.',
  'Rüstungsgewöhnung I': 'Reduziert die Behinderung (BE) deiner Rüstung um 1. Aus BE 3 wird BE 2. Weniger Malus auf GS, INI und körperliche Proben.',
  'Tradition (Gildenmagie)': 'Magische Tradition der Gildenmagier. Erlaubt das Lernen und Wirken von Gildenmagier-Zaubern.',
  'Tradition (Perainekirche)': 'Karmale Tradition der Peraine-Kirche. Erlaubt das Wirken von Peraine-Liturgien (Heilung, Segen, Schutz).',
  'Scharfschütze': 'Fernkampf: Kein Malus für die zweite Distanzstufe. Der Schütze trifft auch auf größere Entfernung präzise.',
  'Schnellladen (Bogen)': 'Erlaubt es, einen Bogen in einer freien Aktion statt einer Aktion zu laden. Ermöglicht Schuss + Bewegung in einer Runde.',
  'Zauber verbreiten': 'Erlaubt es, Zauber auf mehrere Ziele gleichzeitig zu wirken (kostet mehr AsP).',
  'Liturgiestil (Peraine)': 'Spezieller Stil der Peraine-Liturgien. Gibt Boni auf Heilungs-Liturgien.',
}

const TALENT_INFO = {
  klettern: { probe: 'MU/GE/KK', desc: 'Felsklettern, Baumklettern, Mauerklettern. Wird durch Belastung erschwert.' },
  koerperbeherrschung: { probe: 'MU/GE/KO', desc: 'Balance halten, Stürze abfangen, akrobatische Manöver. Wichtig in Kampfsituationen.' },
  kraftakt: { probe: 'KO/KK/KK', desc: 'Schweres heben, Türen eintreten, Fesseln sprengen. Reine Muskelkraft.' },
  selbstbeherrschung: { probe: 'MU/MU/KO', desc: 'Emotionen kontrollieren, Angst unterdrücken, Schmerz ertragen. Gegen Nachteile wie Jähzorn.' },
  sinnesschaerfe: { probe: 'KL/IN/IN', desc: 'Verborgenes entdecken, Geräusche wahrnehmen, Details bemerken. Eine der wichtigsten Proben im Spiel.' },
  zechen: { probe: 'KL/KO/KK', desc: 'Alkohol vertragen ohne betrunken zu werden. In Aventurien sozial wichtig.' },
  einschuechtern: { probe: 'MU/IN/CH', desc: 'Andere durch Drohungen oder Auftreten einschüchtern. Alternative zu Überreden.' },
  mechanik: { probe: 'KL/FF/KK', desc: 'Mechanismen verstehen, Fallen entschärfen, Schleudern bauen.' },
  steinbearbeitung: { probe: 'FF/FF/KK', desc: 'Stein bearbeiten, Mauern reparieren, Skulpturen erschaffen. Typisch zwergisch.' },
  magiekunde: { probe: 'KL/KL/IN', desc: 'Wissen über Magie, Zauber identifizieren, magische Phänomene verstehen.' },
  sagen_und_legenden: { probe: 'KL/KL/IN', desc: 'Mythen, Geschichten und historische Ereignisse kennen.' },
  goetter_und_kulte: { probe: 'KL/KL/IN', desc: 'Wissen über die Zwölfgötter, ihre Kirchen, Rituale und Geweihte.' },
  rechnen: { probe: 'KL/KL/IN', desc: 'Mathematik, Buchführung, Wahrscheinlichkeiten berechnen.' },
  ueberreden: { probe: 'MU/IN/CH', desc: 'Andere durch Argumente und Worte überzeugen. Die wichtigste soziale Probe.' },
  menschenkenntnis: { probe: 'KL/IN/CH', desc: 'Absichten und Gefühle anderer erkennen. Merkt wenn jemand lügt.' },
  heilkunde_wunden: { probe: 'KL/FF/FF', desc: 'Wunden versorgen, Blutungen stoppen, Knochenbrüche schienen. Kann Schmerz-Zustände von Wunden entfernen.' },
  heilkunde_krankheiten: { probe: 'MU/KL/KO', desc: 'Krankheiten diagnostizieren und behandeln.' },
  heilkunde_gift: { probe: 'MU/KL/IN', desc: 'Vergiftungen erkennen und behandeln, Gegengifte herstellen.' },
  pflanzenkunde: { probe: 'KL/FF/KO', desc: 'Pflanzen und Kräuter identifizieren, Heiltees brauen, Giftpflanzen erkennen.' },
  faehrtensuchen: { probe: 'MU/IN/GE', desc: 'Spuren verfolgen, Alter und Art von Fährten bestimmen. Zentral für Jäger und Kundschafter.' },
  schleichen: { probe: 'MU/IN/GE', desc: 'Sich lautlos bewegen. Wird gegen Sinnesschärfe des Gegners geprobt.' },
  wildnisleben: { probe: 'MU/GE/KO', desc: 'In der Wildnis überleben: Lager aufschlagen, Wasser finden, Wetter deuten.' },
  tierkunde: { probe: 'MU/MU/CH', desc: 'Tiere identifizieren, ihr Verhalten verstehen, wilde Tiere beruhigen.' },
  orientierung: { probe: 'KL/IN/IN', desc: 'Den Weg finden, Karten lesen, Himmelsrichtungen bestimmen. Gegen Verirren.' },
  willenskraft: { probe: 'MU/IN/CH', desc: 'Geistigem Druck widerstehen, Verführungen widerstehen, Folter ertragen.' },
}

const SPELL_INFO = {
  ignifaxius: { probe: 'MU/KL/CH', asp: '8 AsP', desc: 'Schleudert einen Feuerstrahl. Schadenszauber. QS bestimmt den Schaden (QS x 1W6 SP Feuer).' },
  fulminictus: { probe: 'MU/KL/CH', asp: '16 AsP', desc: 'Mächtigerer Feuerstrahl mit Explosionswirkung. Mehr Schaden, aber teurer.' },
  balsam_salabunde: { probe: 'KL/IN/CH', asp: '8 AsP', desc: 'Heilt Wunden bei Berührung. QS x 1W6 LeP wiederhergestellt. Der wichtigste Heilzauber.' },
  gardianum: { probe: 'KL/IN/CH', asp: '8 AsP', desc: 'Magischer Schutzschild. Gibt RS gegen magische Angriffe für QS x 3 Kampfrunden.' },
  odem_arcanum: { probe: 'KL/IN/IN', asp: '4 AsP', desc: 'Erkennt aktive Magie in der Umgebung. Zeigt magische Auren und verzauberte Gegenstände.' },
  flim_flam: { probe: 'KL/IN/CH', asp: '4 AsP', desc: 'Erzeugt ein magisches Licht. Beleuchtet die Umgebung wie eine Fackel, ohne Feuer.' },
  horriphobus: { probe: 'MU/IN/CH', asp: '8 AsP', desc: 'Jagt dem Ziel magische Angst ein. Verursacht den Zustand Furcht. Modifiziert um SK des Ziels.' },
  paralysis: { probe: 'MU/KL/CH', asp: '8 AsP', desc: 'Lähmt das Ziel. Verursacht den Zustand Paralyse. Modifiziert um ZK des Ziels.' },
}

const LITURGY_INFO = {
  balsam: { probe: 'KL/IN/CH', kap: '8 KaP', desc: 'Göttliche Heilung durch Peraine. Heilt QS x 1W6 LeP. Benötigt Berührung.' },
  heiliger_beistand: { probe: 'MU/IN/CH', kap: '4 KaP', desc: 'Göttlicher Schutz. Gibt +1 auf alle Proben für QS x 3 Kampfrunden.' },
  blendstrahl: { probe: 'MU/KL/CH', kap: '8 KaP', desc: 'Gleißender Lichtstrahl. Kann Gegner blenden und den Zustand Blind verursachen.' },
  friedvolle_aura: { probe: 'MU/IN/CH', kap: '4 KaP', desc: 'Strahlt Frieden aus. Erschwert Angriffe auf den Geweihten, beruhigt aggressive Wesen.' },
}

// ── Tooltip component ──

function InfoTooltip({ title, children, className = '' }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`relative ${className}`}>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open) }}
        className="inline-flex items-center gap-1 text-dsa-parchment-dark hover:text-dsa-gold transition-colors"
      >
        <Info className="w-3 h-3 flex-shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 left-0 top-full mt-1 w-72 bg-dsa-bg-light border border-dsa-gold/30 rounded-sm shadow-xl p-3 text-xs">
            {title && <div className="font-semibold text-dsa-gold mb-1">{title}</div>}
            <div className="text-dsa-parchment leading-relaxed">{children}</div>
          </div>
        </>
      )}
    </div>
  )
}

function ExpandableItem({ name, badge, badgeVariant = 'gold', explanation, extra, className = '' }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={`rounded-sm border border-dsa-bg-medium transition-colors ${expanded ? 'bg-dsa-bg-light border-dsa-gold/20' : 'bg-dsa-bg hover:border-dsa-gold/10'} ${className}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm text-dsa-parchment truncate">{name}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {badge && <Badge variant={badgeVariant} size="sm">{badge}</Badge>}
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-dsa-parchment-dark" /> : <ChevronDown className="w-3.5 h-3.5 text-dsa-parchment-dark" />}
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-dsa-bg-medium">
          <p className="text-xs text-dsa-parchment/80 mt-2 leading-relaxed">{explanation || 'Keine Beschreibung verfügbar.'}</p>
          {extra && <div className="mt-2">{extra}</div>}
        </div>
      )}
    </div>
  )
}

// ── Probe attributes display ──

function ProbeDisplay({ probeStr, attrs }) {
  if (!probeStr) return null
  const parts = probeStr.split('/')
  return (
    <div className="flex items-center gap-1 text-[11px] mt-1.5">
      {parts.map((attr, i) => {
        const key = attr.trim()
        const val = attrs[key]
        return (
          <span key={i} className="flex items-center">
            {i > 0 && <span className="text-dsa-parchment-dark/40 mx-0.5">/</span>}
            <span className="text-dsa-parchment-dark">{key}</span>
            <span className="font-mono font-bold text-dsa-parchment ml-0.5">{val ?? '?'}</span>
          </span>
        )
      })}
    </div>
  )
}

// ── Main component ──

export default function CharacterDetail() {
  const { characterId } = useParams()
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const [character, setCharacter] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('stats')

  useEffect(() => {
    if (!token) { navigate('/'); return }
    fetchCharacter()
  }, [characterId, token])

  const fetchCharacter = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/characters/${characterId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Charakter nicht gefunden')
      setCharacter(await res.json())
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  if (loading) return <div className="min-h-screen bg-dsa-bg flex items-center justify-center"><div className="text-dsa-parchment-dark">Laden...</div></div>
  if (error || !character) return <div className="min-h-screen bg-dsa-bg flex flex-col items-center justify-center gap-4"><div className="text-red-400">{error || 'Charakter nicht gefunden'}</div><button onClick={() => navigate('/dashboard')} className="btn-primary">Zurück</button></div>

  const attrs = character.attributes || {}
  const derived = character.derived_values || {}
  const combat = character.combat_values || {}
  const weapons = combat.weapons || []
  const talents = character.talents || {}
  const spells = character.spells || {}
  const liturgies = character.liturgies || {}
  const sfs = character.special_abilities || []
  const advantages = character.advantages || []
  const disadvantages = character.disadvantages || []
  const rawInv = character.basis_inventory || {}
  const inventory = Array.isArray(rawInv) ? rawInv : (rawInv.items || [])

  const tabs = [
    { id: 'stats', label: 'Werte', icon: Shield },
    { id: 'talents', label: 'Talente', icon: ScrollText },
    { id: 'combat', label: 'Kampf', icon: Swords },
    ...(Object.keys(spells).length > 0 ? [{ id: 'spells', label: 'Zauber', icon: Sparkles }] : []),
    ...(Object.keys(liturgies).length > 0 ? [{ id: 'liturgies', label: 'Liturgien', icon: Star }] : []),
    { id: 'inventory', label: 'Inventar', icon: Package },
    { id: 'profile', label: 'Profil', icon: Award },
  ]

  const lookupSF = (name) => {
    const normalized = name.replace(/oe/g, 'oe').replace(/ue/g, 'ue').replace(/ae/g, 'ae')
    return SF_INFO[name] || SF_INFO[normalized] || null
  }
  const lookupAdv = (name) => {
    for (const [key, val] of Object.entries(ADVANTAGE_INFO)) {
      if (name.toLowerCase().includes(key.toLowerCase().replace(/ae/g, 'ae').replace(/oe/g, 'oe').replace(/ue/g, 'ue')) ||
          key.toLowerCase().includes(name.toLowerCase())) return val
    }
    return null
  }
  const lookupDisadv = (name) => {
    for (const [key, val] of Object.entries(DISADVANTAGE_INFO)) {
      if (name.toLowerCase().includes(key.toLowerCase().replace(/ae/g, 'ae').replace(/oe/g, 'oe').replace(/ue/g, 'ue')) ||
          key.toLowerCase().includes(name.toLowerCase())) return val
    }
    return null
  }

  return (
    <div className="min-h-screen bg-dsa-bg">
      <header className="sticky top-0 z-10 bg-dsa-bg-light border-b border-dsa-bg-medium">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-dsa-parchment-dark hover:text-dsa-parchment"><ArrowLeft className="w-5 h-5" /></button>
          <div className="flex-1">
            <h1 className="text-lg font-display font-bold text-dsa-gold">{character.name}</h1>
            <p className="text-xs text-dsa-parchment-dark">{character.species} · {character.profession} · {character.total_ap} AP</p>
          </div>
          <Badge variant={character.status === 'active' ? 'success' : character.status === 'dead' ? 'danger' : 'default'}>
            {character.status === 'active' ? 'Aktiv' : character.status === 'dead' ? 'Tot' : character.status === 'resting' ? 'Ruht' : 'Erstellt'}
          </Badge>
        </div>
      </header>

      {/* Vitals with tappable explanations */}
      <div className="max-w-3xl mx-auto px-4 py-3 bg-dsa-bg-card border-b border-dsa-bg-medium">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-red-400" />
            <span className="text-xs text-dsa-parchment-dark w-8">LeP</span>
            <div className="flex-1"><ProgressBar value={derived.LeP_max} max={derived.LeP_max} variant="health" /></div>
            <span className="text-xs text-dsa-parchment font-mono w-16 text-right">{derived.LeP_max}/{derived.LeP_max}</span>
            <InfoTooltip title="Lebenspunkte (LeP)">{DERIVED_INFO.LeP}</InfoTooltip>
          </div>
          {derived.AsP_max > 0 && (
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-dsa-parchment-dark w-8">AsP</span>
              <div className="flex-1"><ProgressBar value={derived.AsP_max} max={derived.AsP_max} variant="mana" /></div>
              <span className="text-xs text-dsa-parchment font-mono w-16 text-right">{derived.AsP_max}/{derived.AsP_max}</span>
              <InfoTooltip title="Astralpunkte (AsP)">{DERIVED_INFO.AsP}</InfoTooltip>
            </div>
          )}
          {derived.KaP_max > 0 && (
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-400" />
              <span className="text-xs text-dsa-parchment-dark w-8">KaP</span>
              <div className="flex-1"><ProgressBar value={derived.KaP_max} max={derived.KaP_max} variant="karma" /></div>
              <span className="text-xs text-dsa-parchment font-mono w-16 text-right">{derived.KaP_max}/{derived.KaP_max}</span>
              <InfoTooltip title="Karmapunkte (KaP)">{DERIVED_INFO.KaP}</InfoTooltip>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-dsa-parchment-dark">
            {[
              ['GS', derived.GS, DERIVED_INFO.GS],
              ['INI', derived.INI_basis, DERIVED_INFO.INI],
              ['AW', derived.AW, DERIVED_INFO.AW],
              ['SK', derived.SK, DERIVED_INFO.SK],
              ['ZK', derived.ZK, DERIVED_INFO.ZK],
              ['SchiP', derived.Schip, DERIVED_INFO.Schip],
            ].map(([label, val, tooltip]) => (
              <span key={label} className="flex items-center gap-0.5">
                {label} <span className="text-dsa-parchment font-mono">{val}</span>
                <InfoTooltip title={label}>{tooltip}</InfoTooltip>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-3xl mx-auto px-4 border-b border-dsa-bg-medium">
        <div className="flex overflow-x-auto gap-1 py-1 scrollbar-hide">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-sm whitespace-nowrap transition-colors ${activeTab === tab.id ? 'bg-dsa-gold/20 text-dsa-gold' : 'text-dsa-parchment-dark hover:text-dsa-parchment'}`}>
              <tab.icon className="w-3.5 h-3.5" />{tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4">
        {activeTab === 'stats' && (
          <div className="space-y-4">
            {/* Attributes — tappable */}
            <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
              <h3 className="text-sm font-semibold text-dsa-gold mb-3">Eigenschaften <span className="font-normal text-dsa-parchment-dark text-xs">(antippen für Erklärung)</span></h3>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(ATTR_INFO).map(([key, info]) => (
                  <ExpandableItem
                    key={key}
                    name={<><span className="text-[10px] text-dsa-parchment-dark block">{key}</span><span className="text-xl font-bold text-dsa-parchment">{attrs[key] || '—'}</span></>}
                    explanation={info.desc}
                    className="text-center"
                  />
                ))}
              </div>
            </div>

            {/* Advantages — each expandable */}
            <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
              <h3 className="text-sm font-semibold text-green-400 mb-2">Vorteile</h3>
              <div className="space-y-1">
                {advantages.map((v, i) => (
                  <ExpandableItem key={i} name={v} badgeVariant="success" explanation={lookupAdv(v) || `Vorteil: ${v}. Tippe hier für Details — dieser Vorteil gibt deinem Helden einen besonderen Bonus.`} />
                ))}
                {advantages.length === 0 && <div className="text-xs text-dsa-parchment-dark">Keine</div>}
              </div>
            </div>

            {/* Disadvantages — each expandable */}
            <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
              <h3 className="text-sm font-semibold text-red-400 mb-2">Nachteile</h3>
              <div className="space-y-1">
                {disadvantages.map((v, i) => (
                  <ExpandableItem key={i} name={v} badgeVariant="danger" explanation={lookupDisadv(v) || `Nachteil: ${v}. Dieser Nachteil beschränkt deinen Helden in bestimmten Situationen.`} />
                ))}
                {disadvantages.length === 0 && <div className="text-xs text-dsa-parchment-dark">Keine</div>}
              </div>
            </div>

            {/* Special Abilities — each expandable */}
            <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
              <h3 className="text-sm font-semibold text-dsa-gold mb-2">Sonderfertigkeiten</h3>
              <div className="space-y-1">
                {sfs.map((sf, i) => (
                  <ExpandableItem key={i} name={sf} badgeVariant="gold" explanation={lookupSF(sf) || `Sonderfertigkeit: ${sf}. Gibt deinem Helden eine spezielle Fähigkeit oder einen Bonus.`} />
                ))}
                {sfs.length === 0 && <div className="text-xs text-dsa-parchment-dark">Keine</div>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'talents' && (
          <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
            <h3 className="text-sm font-semibold text-dsa-gold mb-1">Talente</h3>
            <p className="text-xs text-dsa-parchment-dark mb-3">FW = Fertigkeitswert. Höher = besser. Proben werden mit 3W20 gegen drei Eigenschaften gewürfelt.</p>
            <div className="space-y-1">
              {Object.entries(talents).length === 0 ? (
                <div className="text-xs text-dsa-parchment-dark">Keine Talente</div>
              ) : (
                Object.entries(talents).sort(([,a], [,b]) => b - a).map(([name, fw]) => {
                  const info = TALENT_INFO[name]
                  return (
                    <ExpandableItem
                      key={name}
                      name={
                        <div>
                          <span className="capitalize">{name.replace(/_/g, ' ')}</span>
                          {info && <ProbeDisplay probeStr={info.probe} attrs={attrs} />}
                        </div>
                      }
                      badge={`FW ${fw}`}
                      explanation={info ? info.desc : `Talent: ${name.replace(/_/g, ' ')}. Fertigkeitswert ${fw}.`}
                    />
                  )
                })
              )}
            </div>
          </div>
        )}

        {activeTab === 'combat' && (
          <div className="space-y-4">
            <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
              <h3 className="text-sm font-semibold text-dsa-gold mb-3">Waffen</h3>
              {weapons.map((w, i) => (
                <div key={i} className="bg-dsa-bg rounded-sm p-3 border border-dsa-bg-medium mb-2">
                  <div className="font-semibold text-dsa-parchment text-sm">{w.name}</div>
                  <div className="text-xs text-dsa-parchment-dark mt-1">{w.technique}</div>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs">
                    {[
                      ['AT', w.AT, COMBAT_INFO.AT],
                      w.PA ? ['PA', w.PA, COMBAT_INFO.PA] : null,
                      ['TP', w.TP, COMBAT_INFO.TP],
                      ['RW', w.reach, COMBAT_INFO.RW],
                    ].filter(Boolean).map(([label, val, tooltip]) => (
                      <span key={label} className="flex items-center gap-0.5 text-dsa-parchment">
                        {label} <span className="font-mono font-bold text-dsa-gold">{val}</span>
                        <InfoTooltip title={label}>{tooltip}</InfoTooltip>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {weapons.length === 0 && <div className="text-xs text-dsa-parchment-dark">Keine Waffen ausgerüstet</div>}
            </div>
            <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
              <h3 className="text-sm font-semibold text-dsa-gold mb-2">Rüstung</h3>
              <div className="flex gap-6 text-sm">
                <span className="flex items-center gap-1 text-dsa-parchment">RS <span className="font-mono font-bold text-dsa-gold">{combat.RS || 0}</span><InfoTooltip title="Rüstungsschutz">{COMBAT_INFO.RS}</InfoTooltip></span>
                <span className="flex items-center gap-1 text-dsa-parchment">BE <span className="font-mono font-bold text-dsa-gold">{combat.BE || 0}</span><InfoTooltip title="Behinderung">{COMBAT_INFO.BE}</InfoTooltip></span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'spells' && (
          <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
            <h3 className="text-sm font-semibold text-dsa-gold mb-1">Zaubersprüche</h3>
            <p className="text-xs text-dsa-parchment-dark mb-3">FW = Fertigkeitswert. Zauber kosten AsP und werden mit 3W20 geprobt.</p>
            <div className="space-y-1">
              {Object.entries(spells).sort(([,a], [,b]) => b - a).map(([name, fw]) => {
                const info = SPELL_INFO[name]
                return (
                  <ExpandableItem
                    key={name}
                    name={
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="uppercase">{name.replace(/_/g, ' ')}</span>
                          {info && <span className="text-[10px] text-blue-400/70">{info.asp}</span>}
                        </div>
                        {info && <ProbeDisplay probeStr={info.probe} attrs={attrs} />}
                      </div>
                    }
                    badge={`FW ${fw}`}
                    badgeVariant="mana"
                    explanation={info ? info.desc : `Zauberspruch ${name.replace(/_/g, ' ')}. Fertigkeitswert ${fw}.`}
                  />
                )
              })}
            </div>
          </div>
        )}

        {activeTab === 'liturgies' && (
          <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
            <h3 className="text-sm font-semibold text-dsa-gold mb-1">Liturgien</h3>
            <p className="text-xs text-dsa-parchment-dark mb-3">Göttliche Wunder. Kosten KaP und werden mit 3W20 geprobt.</p>
            <div className="space-y-1">
              {Object.entries(liturgies).sort(([,a], [,b]) => b - a).map(([name, fw]) => {
                const info = LITURGY_INFO[name]
                return (
                  <ExpandableItem
                    key={name}
                    name={
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="capitalize">{name.replace(/_/g, ' ')}</span>
                          {info && <span className="text-[10px] text-yellow-400/70">{info.kap}</span>}
                        </div>
                        {info && <ProbeDisplay probeStr={info.probe} attrs={attrs} />}
                      </div>
                    }
                    badge={`FW ${fw}`}
                    badgeVariant="karma"
                    explanation={info ? info.desc : `Liturgie ${name.replace(/_/g, ' ')}. Fertigkeitswert ${fw}.`}
                  />
                )
              })}
            </div>
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-dsa-gold">Basis-Inventar</h3>
              <div className="text-xs text-dsa-parchment-dark">
                Tragkraft: <span className="text-dsa-parchment font-mono">{(attrs.KK || 0) * 2} Stein</span>
                <InfoTooltip title="Tragkraft">Maximales Gewicht = KK x 2 in Stein. Jede 25% über dem Limit gibt +1 Belastung (BE). Belastung verschlechtert GS, INI und körperliche Proben.</InfoTooltip>
              </div>
            </div>
            <div className="space-y-1">
              {inventory.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-2 rounded hover:bg-dsa-bg transition-colors">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm text-dsa-parchment truncate">{item.name}</span>
                    {item.quantity > 1 && <Badge variant="default" size="sm">x{item.quantity}</Badge>}
                    {item.equipped && <Badge variant="gold" size="sm">Angelegt</Badge>}
                  </div>
                  {item.weight != null && <span className="text-xs text-dsa-parchment-dark flex-shrink-0 ml-2">{item.weight} Stn.</span>}
                </div>
              ))}
              <div className="border-t border-dsa-bg-medium pt-2 mt-2 flex justify-between text-xs">
                <span className="text-dsa-parchment-dark">Gesamtgewicht:</span>
                <span className="text-dsa-parchment font-mono">
                  {inventory.reduce((sum, item) => sum + (item.weight || 0) * (item.quantity || 1), 0).toFixed(1)} Stein
                </span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="space-y-4">
            <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
              <h3 className="text-sm font-semibold text-dsa-gold mb-2">Biographie</h3>
              <p className="text-sm text-dsa-parchment leading-relaxed">{character.bio || 'Keine Biographie hinterlegt.'}</p>
            </div>
            <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
              <h3 className="text-sm font-semibold text-dsa-gold mb-2">Details</h3>
              <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                <div><span className="text-dsa-parchment-dark">Spezies:</span> <span className="text-dsa-parchment">{character.species}</span></div>
                <div><span className="text-dsa-parchment-dark">Profession:</span> <span className="text-dsa-parchment">{character.profession}</span></div>
                <div><span className="text-dsa-parchment-dark">Kultur:</span> <span className="text-dsa-parchment">{character.culture || '—'}</span></div>
                <div className="flex items-center gap-1"><span className="text-dsa-parchment-dark">Erfahrung:</span> <span className="text-dsa-parchment">{character.experience_grade || '—'}</span>
                  <InfoTooltip title="Erfahrungsgrad">Bestimmt das maximale Niveau deiner Werte. Höhere Erfahrungsgrade erlauben höhere Eigenschafts- und Talentwerte. Steigt mit den gesammelten AP.</InfoTooltip>
                </div>
                <div className="flex items-center gap-1"><span className="text-dsa-parchment-dark">AP gesamt:</span> <span className="text-dsa-parchment">{character.total_ap}</span>
                  <InfoTooltip title="Abenteuerpunkte (AP)">AP sind die Erfahrungswährung in DSA5. Du erhältst AP am Ende jeder Session vom Spielleiter. Du kannst AP ausgeben um Talente, Zauber, Eigenschaften und Sonderfertigkeiten zu steigern.</InfoTooltip>
                </div>
                <div><span className="text-dsa-parchment-dark">AP verfügbar:</span> <span className="text-dsa-gold font-semibold">{character.available_ap}</span></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
