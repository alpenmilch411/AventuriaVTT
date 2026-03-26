import { useState, useEffect } from 'react'
import {
  TrendingUp, Brain, Swords, Sparkles, Sun,
  ChevronDown, ChevronUp, Check, X, HelpCircle, Star, AlertTriangle, Loader2
} from 'lucide-react'
import clsx from 'clsx'
import useAuthStore from '../../stores/authStore'

// ── DSA5 Steigerungsfaktor-Kostentabellen (same as SteigerungTab) ──
const SF_TABLES = {
  A: { 0:1,1:1,2:1,3:1,4:1,5:1,6:1,7:1, 8:2,9:2,10:2,11:2,12:2, 13:3,14:3,15:3, 16:4,17:4, 18:5,19:6,20:7,21:8,22:9,23:10,24:12 },
  B: { 0:2,1:2,2:2,3:2,4:2,5:2,6:2,7:2, 8:4,9:4,10:4,11:4,12:4, 13:6,14:6,15:6, 16:8,17:8, 18:10,19:12,20:14,21:16,22:18,23:20,24:24 },
  C: { 0:3,1:3,2:3,3:3,4:3,5:3,6:3,7:3, 8:6,9:6,10:6,11:6,12:6, 13:9,14:9,15:9, 16:12,17:12, 18:15,19:18,20:21,21:24,22:27,23:30,24:36 },
  D: { 0:4,1:4,2:4,3:4,4:4,5:4,6:4,7:4, 8:8,9:8,10:8,11:8,12:8, 13:12,14:12,15:12, 16:16,17:16, 18:20,19:24,20:28,21:32,22:36,23:40,24:48 },
  E: { 0:5,1:5,2:5,3:5,4:5,5:5,6:5,7:5, 8:10,9:10,10:10,11:10,12:10, 13:15,14:15,15:15, 16:20,17:20, 18:25,19:30,20:35,21:40,22:45,23:50,24:60 },
}

const ATTR_COST = {
  8:15, 9:15, 10:15, 11:15, 12:15, 13:15, 14:15,
  15:30, 16:30, 17:30, 18:60, 19:60, 20:120, 21:120, 22:240, 23:240, 24:480,
}

const GRADE_LIMITS = {
  unerfahren:     { attr: 14, skill: 14, kt: 14, spell: 14, label: 'Unerfahren' },
  durchschnittlich: { attr: 15, skill: 16, kt: 16, spell: 16, label: 'Durchschnittlich' },
  erfahren:       { attr: 16, skill: 18, kt: 18, spell: 18, label: 'Erfahren' },
  kompetent:      { attr: 17, skill: 20, kt: 20, spell: 20, label: 'Kompetent' },
  meisterlich:    { attr: 18, skill: 22, kt: 22, spell: 22, label: 'Meisterlich' },
  brillant:       { attr: 19, skill: 24, kt: 24, spell: 24, label: 'Brillant' },
  legendaer:      { attr: 20, skill: 25, kt: 25, spell: 25, label: 'Legendar' },
}

const TALENT_SF = {
  'korper': 'B', 'gesellschaft': 'B', 'natur': 'C', 'wissen': 'C', 'handwerk': 'B',
  'koerper': 'B', 'body': 'B', 'social': 'B', 'nature': 'C', 'knowledge': 'C', 'craft': 'B',
}

const ATTR_META = {
  MU: { name: 'Mut', color: 'text-red-400' },
  KL: { name: 'Klugheit', color: 'text-blue-400' },
  IN: { name: 'Intuition', color: 'text-violet-400' },
  CH: { name: 'Charisma', color: 'text-pink-400' },
  FF: { name: 'Fingerfertigkeit', color: 'text-emerald-400' },
  GE: { name: 'Gewandtheit', color: 'text-cyan-400' },
  KO: { name: 'Konstitution', color: 'text-orange-400' },
  KK: { name: 'Korperkraft', color: 'text-amber-400' },
}

const TALENT_CATEGORIES = [
  { id: 'korper', label: 'Korpertalente', color: 'text-orange-400', borderColor: 'border-orange-800/30' },
  { id: 'gesellschaft', label: 'Gesellschaftstalente', color: 'text-pink-400', borderColor: 'border-pink-800/30' },
  { id: 'natur', label: 'Naturtalente', color: 'text-green-400', borderColor: 'border-green-800/30' },
  { id: 'wissen', label: 'Wissenstalente', color: 'text-blue-400', borderColor: 'border-blue-800/30' },
  { id: 'handwerk', label: 'Handwerkstalente', color: 'text-amber-400', borderColor: 'border-amber-800/30' },
]

function getUpgradeCost(currentValue, sf) {
  const table = SF_TABLES[sf]
  if (!table) return 999
  if (currentValue in table) return table[currentValue]
  if (currentValue > 24) return table[24] * Math.pow(2, currentValue - 24)
  return 999
}

function getAttrCost(currentValue) {
  return ATTR_COST[currentValue] || (currentValue < 8 ? 15 : 480)
}

// ── Confirmation sub-modal ──
function ConfirmModal({ title, description, cost, available, onConfirm, onCancel }) {
  const affordable = cost <= available
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-dsa-bg border border-dsa-bg-medium rounded shadow-2xl w-full max-w-sm animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-dsa-bg-medium bg-dsa-bg-card">
          <h3 className="text-sm font-display font-semibold text-dsa-gold">{title}</h3>
          <button onClick={onCancel} className="text-dsa-parchment-dark/40 hover:text-dsa-parchment"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-dsa-parchment">{description}</p>
          <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded-sm p-3 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-dsa-parchment-dark">Kosten</span>
              <span className={clsx('font-mono font-bold', affordable ? 'text-dsa-gold' : 'text-red-400')}>{cost} AP</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-dsa-parchment-dark">Verfugbar</span>
              <span className="font-mono font-bold text-green-400">{available} AP</span>
            </div>
            <div className="flex justify-between text-xs border-t border-dsa-bg-medium pt-1">
              <span className="text-dsa-parchment-dark">Danach ubrig</span>
              <span className={clsx('font-mono font-bold', affordable ? 'text-dsa-parchment' : 'text-red-400')}>{available - cost} AP</span>
            </div>
          </div>
          {!affordable && (
            <div className="flex items-center gap-2 text-red-400 text-xs bg-red-900/20 border border-red-800/30 rounded-sm p-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Nicht genug Abenteuerpunkte!</span>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={onCancel} className="flex-1 px-3 py-2 text-xs bg-dsa-bg-card border border-dsa-bg-medium rounded-sm text-dsa-parchment-dark hover:text-dsa-parchment transition">
              Abbrechen
            </button>
            <button
              onClick={onConfirm}
              disabled={!affordable}
              className="flex-1 px-3 py-2 text-xs bg-dsa-gold/20 border border-dsa-gold/30 rounded-sm text-dsa-gold font-bold hover:bg-dsa-gold/30 transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Check className="w-3.5 h-3.5 inline mr-1" />
              Steigern
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Collapsible Section ──
function Section({ title, icon: Icon, color, children, count, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-dsa-bg-medium rounded-sm overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 bg-dsa-bg-card hover:bg-dsa-bg-light transition text-left">
        <Icon className={clsx('w-4 h-4', color)} />
        <span className={clsx('text-xs font-bold uppercase tracking-wider flex-1', color)}>{title}</span>
        {count != null && <span className="text-[10px] font-mono text-dsa-parchment-dark">{count}</span>}
        {open ? <ChevronUp className="w-3.5 h-3.5 text-dsa-parchment-dark" /> : <ChevronDown className="w-3.5 h-3.5 text-dsa-parchment-dark" />}
      </button>
      {open && <div className="p-2 space-y-1">{children}</div>}
    </div>
  )
}

// ── Upgrade Row ──
function UpgradeRow({ name, currentValue, cost, maxReached, affordable, sf, probeAttrs, onUpgrade }) {
  return (
    <div className={clsx(
      'flex items-center gap-2 px-2 py-1.5 rounded-sm transition',
      maxReached ? 'opacity-40' : 'hover:bg-dsa-bg-card/50'
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-dsa-parchment truncate">{name}</span>
          {sf && <span className="text-[9px] font-mono text-dsa-parchment-dark/50 bg-dsa-bg-card px-1 rounded">{sf}</span>}
        </div>
        {probeAttrs && <div className="text-[9px] text-dsa-parchment-dark/50">{probeAttrs}</div>}
      </div>
      <div className="text-sm font-mono font-bold text-dsa-parchment w-8 text-center">{currentValue}</div>
      {maxReached ? (
        <div className="text-[9px] text-dsa-parchment-dark/40 w-20 text-center">Maximum</div>
      ) : (
        <button
          onClick={onUpgrade}
          className={clsx(
            'flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-bold border transition min-w-[72px] justify-center',
            affordable
              ? 'bg-dsa-gold/10 border-dsa-gold/30 text-dsa-gold hover:bg-dsa-gold/20'
              : 'bg-dsa-bg-card border-dsa-bg-medium text-dsa-parchment-dark/40 cursor-not-allowed'
          )}
          disabled={!affordable}
        >
          <TrendingUp className="w-3 h-3" />
          {cost} AP
        </button>
      )}
    </div>
  )
}

// ── Main Modal ──
export default function SteigerungModal({ character, onClose, onSaved }) {
  const token = useAuthStore((s) => s.token)
  const [char, setChar] = useState(character)
  const [confirm, setConfirm] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [talentTemplates, setTalentTemplates] = useState([])
  const [combatTechTemplates, setCombatTechTemplates] = useState([])

  // Load databank templates for talent/CT names
  useEffect(() => {
    if (!token) return
    const headers = { Authorization: `Bearer ${token}` }
    Promise.all([
      fetch('/api/databank/talents', { headers }).then(r => r.ok ? r.json() : []),
      fetch('/api/databank/combat_techniques', { headers }).then(r => r.ok ? r.json() : []),
    ]).then(([t, ct]) => {
      setTalentTemplates(Array.isArray(t) ? t : t.items || [])
      setCombatTechTemplates(Array.isArray(ct) ? ct : ct.items || [])
    }).catch(() => {})
  }, [token])

  const attrs = char.attributes || {}
  const talents = char.talents || {}
  const charCT = char.combat_techniques || {}
  const availableAP = char.available_ap || 0
  const totalAP = char.total_ap || 0
  const grade = (char.experience_grade || 'erfahren').toLowerCase()
  const limits = GRADE_LIMITS[grade] || GRADE_LIMITS.erfahren

  const doUpgrade = async () => {
    if (!confirm) return
    setLoading(true)
    try {
      const res = await fetch(`/api/characters/${char.id}/level-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          upgrades: [{
            type: confirm.type,
            id: confirm.id,
            ...(confirm.sf ? { steigerungsfaktor: confirm.sf } : {}),
          }],
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Steigerung fehlgeschlagen')
      }
      // Re-fetch updated character
      const charRes = await fetch(`/api/characters/${char.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (charRes.ok) {
        const updated = await charRes.json()
        setChar(updated)
      }
      setResult({ ok: true, text: `${confirm.title} erfolgreich!` })
    } catch (err) {
      setResult({ ok: false, text: err.message })
    } finally {
      setLoading(false)
      setConfirm(null)
      setTimeout(() => setResult(null), 5000)
    }
  }

  const requestUpgrade = (title, desc, cost, type, id, sf) => {
    setConfirm({ title, desc, cost, type, id, sf })
  }

  const handleClose = () => {
    // Pass updated character back if AP was spent
    if (char.available_ap !== character.available_ap) {
      onSaved(char)
    } else {
      onClose()
    }
  }

  // Handle Escape key
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (confirm) setConfirm(null)
        else handleClose()
      }
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [confirm])

  const normName = (n) => n.toLowerCase().replace(/[äöüß]/g, m => ({ 'ä':'ae','ö':'oe','ü':'ue','ß':'ss' }[m] || m))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={handleClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] bg-dsa-bg-card border border-dsa-bg-medium rounded shadow-2xl animate-slide-up flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dsa-bg-medium flex-shrink-0">
          <div>
            <h2 className="text-lg font-display font-semibold text-dsa-gold">AP ausgeben</h2>
            <p className="text-xs text-dsa-parchment-dark mt-0.5">{char.name}</p>
          </div>
          <button onClick={handleClose} className="p-1 text-dsa-parchment-dark hover:text-dsa-parchment rounded-sm hover:bg-dsa-bg-medium transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {/* AP summary */}
          <div className="bg-gradient-to-r from-amber-900/40 to-amber-950/20 border border-amber-800/30 rounded-sm px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-dsa-gold" />
                <span className="text-sm font-display font-bold text-dsa-gold uppercase tracking-wider">Steigerung</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-[10px] text-dsa-parchment-dark uppercase">Verfugbar</div>
                  <div className="text-lg font-mono font-bold text-green-400">{availableAP} <span className="text-[10px] text-dsa-parchment-dark font-normal">AP</span></div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-dsa-parchment-dark uppercase">Gesamt</div>
                  <div className="text-sm font-mono text-dsa-parchment">{totalAP}</div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-2 text-[10px] text-dsa-parchment-dark">
              <span>Erfahrungsgrad: <strong className="text-dsa-parchment">{limits.label}</strong></span>
              <span>Max. Eigenschaften: <strong className="text-dsa-parchment">{limits.attr}</strong></span>
              <span>Max. Fertigkeiten: <strong className="text-dsa-parchment">{limits.skill}</strong></span>
            </div>
          </div>

          {/* Result message */}
          {result && (
            <div className={clsx(
              'px-3 py-2 rounded-sm text-xs border flex items-center gap-2',
              result.ok ? 'bg-green-900/20 border-green-800/30 text-green-400' : 'bg-red-900/20 border-red-800/30 text-red-400'
            )}>
              {result.ok ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {result.text}
            </div>
          )}

          {/* Attributes */}
          <Section title="Eigenschaften" icon={Brain} color="text-dsa-gold" count="8 Werte" defaultOpen>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-0.5">
              {Object.entries(ATTR_META).map(([key, meta]) => {
                const val = attrs[key] || 8
                const cost = getAttrCost(val)
                const maxReached = val >= limits.attr
                return (
                  <div key={key} className={clsx(
                    'flex items-center gap-2 px-2 py-1.5 rounded-sm transition',
                    maxReached ? 'opacity-40' : 'hover:bg-dsa-bg-card/50'
                  )}>
                    <div className={clsx('text-xs font-bold w-16', meta.color)}>{meta.name}</div>
                    <div className="text-sm font-mono font-bold text-dsa-parchment w-8 text-center">{val}</div>
                    <div className="text-[9px] text-dsa-parchment-dark/40 flex-1">{'\u2192'} {val + 1}</div>
                    {maxReached ? (
                      <div className="text-[9px] text-dsa-parchment-dark/40 w-20 text-center">Maximum</div>
                    ) : (
                      <button
                        onClick={() => requestUpgrade(
                          `${meta.name} steigern`,
                          `${meta.name} von ${val} auf ${val + 1} steigern.`,
                          cost, 'attribute', key
                        )}
                        disabled={cost > availableAP}
                        className={clsx(
                          'flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-bold border transition min-w-[72px] justify-center',
                          cost <= availableAP
                            ? 'bg-dsa-gold/10 border-dsa-gold/30 text-dsa-gold hover:bg-dsa-gold/20'
                            : 'bg-dsa-bg-card border-dsa-bg-medium text-dsa-parchment-dark/40 cursor-not-allowed'
                        )}
                      >
                        <TrendingUp className="w-3 h-3" />
                        {cost} AP
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </Section>

          {/* Talents */}
          <Section title="Talente" icon={Brain} color="text-blue-400" count={`${Object.keys(talents).length} gelernt`}>
            {TALENT_CATEGORIES.map(cat => {
              const sf = TALENT_SF[cat.id] || 'B'
              const catTalents = talentTemplates.filter(t =>
                (t.category || '').toLowerCase() === cat.id ||
                (t.category || '').toLowerCase().replace(/ö/g, 'oe') === cat.id
              )
              if (catTalents.length === 0) return null
              return (
                <div key={cat.id} className="mb-2">
                  <div className={clsx('text-[9px] uppercase tracking-wider font-bold px-2 py-1 border-b', cat.color, cat.borderColor)}>
                    {cat.label} ({sf})
                  </div>
                  {catTalents.map(t => {
                    const charVal = Object.entries(talents).find(([k]) =>
                      normName(k) === normName(t.name) || k.toLowerCase() === t.name.toLowerCase()
                    )?.[1] || 0
                    const val = typeof charVal === 'object' ? (charVal.fw || charVal.value || 0) : (charVal || 0)
                    const cost = getUpgradeCost(val, sf)
                    const maxReached = val >= limits.skill
                    const probe = t.probe ? t.probe.join('/') : ''
                    return (
                      <UpgradeRow
                        key={t.id}
                        name={t.name}
                        currentValue={val}
                        cost={cost}
                        maxReached={maxReached}
                        affordable={cost <= availableAP}
                        sf={sf}
                        probeAttrs={probe ? `Probe: ${probe}` : null}
                        onUpgrade={() => requestUpgrade(
                          `${t.name} steigern`,
                          `Talent "${t.name}" von FW ${val} auf ${val + 1}.`,
                          cost, 'talent', t.id || t.name, sf
                        )}
                      />
                    )
                  })}
                </div>
              )
            })}
          </Section>

          {/* Combat Techniques */}
          {Object.keys(charCT).length > 0 && (
            <Section title="Kampftechniken" icon={Swords} color="text-red-400" count={`${Object.keys(charCT).length} gelernt`}>
              {combatTechTemplates.map(ct => {
                const charVal = Object.entries(charCT).find(([k]) =>
                  normName(k) === normName(ct.name) || k.toLowerCase() === ct.name.toLowerCase()
                )?.[1] || 0
                const val = typeof charVal === 'object' ? (charVal.ktw || charVal.value || 6) : (charVal || 6)
                const sf = ct.steigerungsfaktor || 'C'
                const cost = getUpgradeCost(val, sf)
                const maxReached = val >= limits.kt
                return (
                  <UpgradeRow
                    key={ct.id}
                    name={ct.name}
                    currentValue={val}
                    cost={cost}
                    maxReached={maxReached}
                    affordable={cost <= availableAP}
                    sf={sf}
                    onUpgrade={() => requestUpgrade(
                      `${ct.name} steigern`,
                      `Kampftechnik "${ct.name}" von KtW ${val} auf ${val + 1}.`,
                      cost, 'combat_technique', ct.id || ct.name, sf
                    )}
                  />
                )
              })}
            </Section>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-dsa-bg-medium flex items-center justify-end flex-shrink-0">
          <button onClick={handleClose} className="btn-secondary text-sm">
            Schliessen
          </button>
        </div>
      </div>

      {/* Confirmation sub-modal */}
      {confirm && (
        <ConfirmModal
          title={confirm.title}
          description={confirm.desc}
          cost={confirm.cost}
          available={availableAP}
          onConfirm={doUpgrade}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
