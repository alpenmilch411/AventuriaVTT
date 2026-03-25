import React, { useState, useEffect, useRef } from 'react'
import {
  Swords, Shield, Target, ChevronRight,
  Crosshair, Zap, HelpCircle, X, Sparkles
} from 'lucide-react'
import useCharacterStore from '../../stores/characterStore'
import useAuthStore from '../../stores/authStore'
import useCombatValues from '../../hooks/useCombatValues'
import { COMBAT_SPECIAL_ABILITIES } from '../../engine/weaponProperties'
import Badge from '../../components/common/Badge'
import clsx from 'clsx'

// ── Classifiers ──
const isWeaponItem = n => /schwert|axt|dolch|bogen|messer|stab|kolben|speer|hammer|hellebarde|morgenstern|peitsche|keule|saebel|rapier|kriegsaxt|wurfaxt|armbrust|schleuder|rondrakamm/i.test(n)
const isArmorItem = n => /ruestung|hemd|harnisch|panzer|gambeson|wams|platte|kleidung|robe|pelz|knochen|schienen/i.test(n)
const isShieldItem = n => /schild|buckler/i.test(n)
const isHelmItem = n => /helm/i.test(n)
const isFocusItem = n => /magierstab|zauberstab|kristallkugel|magier|fokus/i.test(n)

// ── Visual Maps ──
const DMG_ICON = { schnitt: '\u2694\uFE0F', stich: '\uD83D\uDDE1\uFE0F', stumpf: '\uD83D\uDD28', feuer: '\uD83D\uDD25', heilig: '\u2728' }
const PROP_STYLE = {
  wuchtig:         { bg: 'bg-red-900/30 text-red-400 border-red-800/30', tip: 'Wuchtige Waffe — der Gegner bekommt -1 auf seine Parade gegen Angriffe mit dieser Waffe.' },
  flexibel:        { bg: 'bg-blue-900/30 text-blue-400 border-blue-800/30', tip: 'Flexible Waffe (z.B. Kette/Peitsche) — ignoriert den Schildbonus des Gegners bei der Parade.' },
  geweiht:         { bg: 'bg-dsa-gold/20 text-dsa-gold border-dsa-gold/30', tip: 'Geweihte Waffe — richtet doppelten Schaden gegen Untote und Dämonen an. Gegen normale Gegner kein Unterschied.' },
  zwergisch:       { bg: 'bg-amber-900/30 text-amber-400 border-amber-800/30', tip: 'Zwergische Schmiedekunst — besonders robust und widerstandsfähig gegen Beschädigung.' },
  elfisch:         { bg: 'bg-green-900/30 text-green-400 border-green-800/30', tip: 'Elfische Fertigung — leicht und präzise gefertigt, liegt perfekt in der Hand.' },
  improvisiert:    { bg: 'bg-dsa-bg-medium text-dsa-parchment-dark border-dsa-bg-medium', tip: 'Improvisierte Waffe (Stuhl, Flasche, etc.) — AT und PA jeweils -2.' },
  primitiv:        { bg: 'bg-dsa-bg-medium text-dsa-parchment-dark border-dsa-bg-medium', tip: 'Primitive Fertigung — kann bei einem Patzer (20) zerbrechen.' },
  anderthalbhaendig: { bg: 'bg-purple-900/30 text-purple-400 border-purple-800/30', tip: 'Kann ein- oder zweihändig geführt werden. Zweihändig gibt +1 TP, aber kein Schild möglich.' },
  fesselnd:        { bg: 'bg-cyan-900/30 text-cyan-400 border-cyan-800/30', tip: 'Kann das Ziel bei einem Treffer festhalten (Fesselmanöver). Ziel muss sich befreien.' },
}

// ── SF Explanations (beginner-friendly) ──
const SF_EXPLAIN = {
  'Wuchtschlag I': 'Du schlägst besonders hart zu. Dein Angriff wird schwieriger (-2 AT), aber der Schaden steigt um 2.',
  'Wuchtschlag II': 'Noch härter zuschlagen. -4 auf Angriff, aber +4 Schaden bei Treffer.',
  'Wuchtschlag III': 'Maximale Wucht. -6 AT, +6 TP — nur für erfahrene Kämpfer.',
  'Finte I': 'Du täuschst den Gegner an. -1 auf deinen Angriff, aber der Gegner bekommt -2 auf seine Parade.',
  'Finte II': '-2 AT, Gegner -4 PA. Sehr effektiv gegen gut gepanzerte Feinde.',
  'Finte III': '-3 AT, Gegner -6 PA. Meisterhafte Täuschung.',
  'Hammerschlag': 'Gewaltiger Schlag der Rüstung durchbricht. -4 AT, +4 TP, RS des Gegners halbiert.',
  'Todesstoß': 'Vernichtender Angriff. -8 AT, Schaden x2. Nur 1x pro Kampf einsetzbar.',
  'Niederwerfen': 'Versuch den Gegner umzuwerfen. -2 AT, bei Treffer KK-Vergleich — Gegner ist liegend.',
  'Ausfall': 'Überraschender Vorstoß. -2 AT, dafür zählt deine Reichweite eine Stufe höher.',
  'Meisterparade': 'Du kannst in einer Kampfrunde ein zweites Mal parieren. Die zweite Parade hat -4.',
  'Schildkampf I': '+1 auf Parade wenn du einen Schild trägst. Grundvoraussetzung für effektiven Schildeinsatz.',
  'Schildkampf II': '+2 auf Parade mit Schild. Du bist ein Meister der Schildverteidigung.',
  'Rüstungsgewöhnung I': 'Deine Rüstung behindert dich weniger. Behinderung (BE) sinkt um 1.',
  'Rüstungsgewöhnung II': 'BE sinkt um 2. Du bewegst dich in Rüstung fast so frei wie ohne.',
  'Verbessertes Ausweichen I': '+2 auf Ausweichen. Gut für Kämpfer ohne Schild.',
  'Verbessertes Ausweichen II': '+4 auf Ausweichen. Du weichst Angriffen meisterhaft aus.',
  'Kampfreflexe': '+2 auf Initiative und du kannst nicht überrascht werden.',
  'Kampfgespür': '+1 auf Parade und +1 auf Ausweichen. Allgemeiner Verteidigungsbonus.',
  'Scharfschütze': 'Distanzabzüge beim Fernkampf um 2 reduziert. Nah und Mittel ohne Malus.',
  'Schnellladen (Bogen)': 'Du lädst deinen Bogen als freie Aktion statt als Aktion. Ermöglicht Schießen jede Runde.',
  'Präziser Schuss I': 'Gezielter Schuss: -4 FK, aber +2 TP. Für Situationen wo Schaden zählt.',
  'Schnellschuss': '2 Schüsse pro Kampfrunde, aber jeweils -4 FK.',
  'Beidhändiger Kampf I': 'Du kämpfst mit zwei Waffen. Zusatzangriff mit der Nebenhand bei -4 AT.',
  'Beidhändiger Kampf II': 'Wie I, aber Nebenhand nur -2 AT. Fast so gut wie die Haupthand.',
}

// ── Tooltip ──
function Tip({ text }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-flex">
      <button onClick={(e) => { e.stopPropagation(); setShow(!show) }} className="text-dsa-parchment-dark/40 hover:text-dsa-gold transition-colors">
        <HelpCircle className="w-3 h-3" />
      </button>
      {show && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShow(false)} />
          <div className="absolute z-50 bottom-full mb-1 left-1/2 -translate-x-1/2 w-56 bg-dsa-bg-light border border-dsa-gold/30 rounded-sm shadow-xl p-2.5 text-[10px] text-dsa-parchment leading-relaxed">
            {text}
          </div>
        </>
      )}
    </span>
  )
}

// ── Derived Stat Card (tap for formula, shows condition modifier) ──
// ── Equip Slot (fantasy gem/diamond style) ──
function EquipSlot({ equipped, onClick, size = 'md' }) {
  const sz = size === 'lg' ? 'w-8 h-8' : 'w-7 h-7'
  const diamond = size === 'lg' ? 'w-3.5 h-3.5' : 'w-3 h-3'
  return (
    <button
      onClick={onClick}
      title={equipped ? 'Ablegen' : 'Anlegen'}
      className={clsx(
        'flex-shrink-0 flex items-center justify-center transition-all p-1',
        sz,
      )}
    >
      <div className={clsx(
        diamond, 'rotate-45 border-2 transition-all',
        equipped
          ? 'bg-dsa-gold border-dsa-gold shadow-[0_0_6px_rgba(201,168,76,0.6)]'
          : 'bg-transparent border-dsa-parchment-dark/40 hover:border-dsa-parchment-dark/70'
      )} />
    </button>
  )
}

// ── Detail Popup ──
function DetailPopup({ title, children, onClose, accentClass }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-dsa-bg border border-dsa-bg-medium rounded shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className={clsx('flex items-center justify-between px-4 py-3 border-b border-dsa-bg-medium', accentClass || 'bg-dsa-bg-light')}>
          <h3 className="text-sm font-display font-semibold text-dsa-gold">{title}</h3>
          <button onClick={onClose} className="text-dsa-parchment-dark/40 hover:text-dsa-parchment"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  )
}

function ArmoryTab() {
  const myCharacter = useCharacterStore((s) => s.myCharacter)
  const setMyCharacter = useCharacterStore((s) => s.setMyCharacter)
  const getVitals = useCharacterStore((s) => s.getVitals)
  const token = useAuthStore((s) => s.token)
  const centralCV = useCombatValues() // centralized combat values
  const [detailPopup, setDetailPopup] = useState(null)
  const [equipError, setEquipError] = useState(null) // { message, top, left }
  const [mainHandWeapon, setMainHandWeapon] = useState(null) // name of main hand weapon for dual-wield
  const [armorTemplates, setArmorTemplates] = useState([])
  const [shieldTemplates, setShieldTemplates] = useState([])
  const [weaponTemplates, setWeaponTemplates] = useState([])
  const [combatTechTemplates, setCombatTechTemplates] = useState([])

  useEffect(() => {
    if (!token) return
    const h = { Authorization: `Bearer ${token}` }
    Promise.all([
      fetch('/api/databank/armor', { headers: h }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/databank/shields', { headers: h }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/databank/weapons', { headers: h }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/databank/combat_techniques', { headers: h }).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([a, s, w, ct]) => {
      setArmorTemplates(Array.isArray(a) ? a : a.items || [])
      setShieldTemplates(Array.isArray(s) ? s : s.items || [])
      setWeaponTemplates(Array.isArray(w) ? w : w.items || [])
      setCombatTechTemplates(Array.isArray(ct) ? ct : ct.items || [])
    })
  }, [token])

  const matchArmor = (name) => armorTemplates.find(t => name.toLowerCase().includes(t.name.toLowerCase().split(' ')[0]) || t.name.toLowerCase().includes(name.toLowerCase().split(' ')[0]))
  const matchShield = (name) => shieldTemplates.find(t => name.toLowerCase().includes(t.name.toLowerCase().split('/')[0].trim()) || t.name.toLowerCase().includes(name.toLowerCase().split(' ')[0]))

  const showError = (msg, e) => {
    const rect = e?.currentTarget?.getBoundingClientRect?.()
    const top = rect ? rect.top + rect.height + 4 : 100
    const left = rect ? Math.min(rect.left, window.innerWidth - 280) : 16
    setEquipError({ message: msg, top, left })
    setTimeout(() => setEquipError(null), 4000)
  }

  // ── Equip Toggle (with DSA5 rules — validates and shows errors) ──
  const toggleEquip = (itemName, e) => {
    if (!myCharacter) return
    const rawInv = myCharacter.basis_inventory || []
    const invObj = Array.isArray(rawInv) ? { items: rawInv } : rawInv
    let allItems = [...(invObj.items || [])]
    let target = allItems.find(i => i.name === itemName)
    // Auto-create inventory entry for weapons that exist in combat_values but not in inventory
    if (!target) {
      const cvWeapon = (myCharacter.combat_values?.weapons || []).find(w => w.name === itemName)
      if (cvWeapon) {
        target = { name: itemName, quantity: 1, weight: 0, equipped: false }
        allItems.push(target)
      } else {
        return
      }
    }
    const equipping = !target.equipped
    const n = itemName
    const cv = myCharacter.combat_values || {}

    if (equipping) {
      // Armor: only one body armor at a time — block if another equipped
      if (isArmorItem(n) && !isHelmItem(n)) {
        const existing = allItems.find(i => i.name !== n && isArmorItem(i.name) && !isHelmItem(i.name) && i.equipped)
        if (existing) { showError(`Bereits eine Rüstung angelegt (${existing.name}). Lege diese zuerst ab.`, e); return }
      }
      // Helm: only one
      if (isHelmItem(n)) {
        const existing = allItems.find(i => i.name !== n && isHelmItem(i.name) && i.equipped)
        if (existing) { showError(`Bereits ein Helm angelegt (${existing.name}). Lege diesen zuerst ab.`, e); return }
      }
      // Shield rules
      if (isShieldItem(n)) {
        const existing = allItems.find(i => i.name !== n && isShieldItem(i.name) && i.equipped)
        if (existing) { showError(`Bereits ein Schild angelegt (${existing.name}). Lege diesen zuerst ab.`, e); return }
        // Shield + 2H weapon conflict
        const equipped2H = allItems.find(i => {
          if (!isWeaponItem(i.name) || !i.equipped) return false
          const wm = (cv.weapons || []).find(w => i.name.toLowerCase().includes(w.name.toLowerCase().split(' ')[0]))
          const wt = weaponTemplates.find(t => i.name.toLowerCase().includes(t.name.toLowerCase().split(' ')[0]))
          return wm?.two_handed || wt?.two_handed
        })
        if (equipped2H) { showError(`${equipped2H.name} ist zweihändig — kein Schild möglich. Lege die Waffe zuerst ab.`, e); return }
        // Shield + dual-wield conflict: if 2 melee weapons equipped, off-hand is occupied
        const equippedMelee = allItems.filter(i => isWeaponItem(i.name) && i.equipped).filter(i => {
          const wm = (cv.weapons || []).find(w => i.name.toLowerCase().includes(w.name.toLowerCase().split(' ')[0]))
          return wm && !wm.ranged
        })
        if (equippedMelee.length >= 2) { showError(`Beide Hände belegt (${equippedMelee.map(i=>i.name).join(' + ')}). Lege eine Waffe ab um den Schild anzulegen.`, e); return }
      }
      // Weapon rules
      if (isWeaponItem(n)) {
        const wm = (cv.weapons || []).find(w => n.toLowerCase().includes(w.name.toLowerCase().split(' ')[0]))
        const wt = weaponTemplates.find(t => n.toLowerCase().includes(t.name.toLowerCase().split(' ')[0]))
        const isTwoHanded = wm?.two_handed || wt?.two_handed
        const isRanged = wm?.ranged || false
        const hasBeidhaendigSF = (myCharacter.special_abilities || []).some(s => /[Bb]eidh/i.test(s))
        const equippedShieldItem = allItems.find(i => isShieldItem(i.name) && i.equipped)
        const equippedWeapons = allItems.filter(i => i.name !== n && isWeaponItem(i.name) && i.equipped)
        const equippedMeleeWeapons = equippedWeapons.filter(i => {
          const wm2 = (cv.weapons || []).find(w => i.name.toLowerCase().includes(w.name.toLowerCase().split(' ')[0]))
          return wm2 && !wm2.ranged
        })
        const equippedRangedWeapons = equippedWeapons.filter(i => {
          const wm2 = (cv.weapons || []).find(w => i.name.toLowerCase().includes(w.name.toLowerCase().split(' ')[0]))
          return wm2 && wm2.ranged
        })

        // Universal check: if any already-equipped weapon is 2H, nothing else can be added
        const alreadyEquipped2H = equippedWeapons.find(i => {
          const wm2 = (cv.weapons || []).find(w => i.name.toLowerCase().includes(w.name.toLowerCase().split(' ')[0]))
          const wt2 = weaponTemplates.find(t => i.name.toLowerCase().includes(t.name.toLowerCase().split(' ')[0]))
          return wm2?.two_handed || wt2?.two_handed
        })
        if (alreadyEquipped2H) {
          showError(`${alreadyEquipped2H.name} ist zweihändig und belegt beide Hände. Lege sie zuerst ab.`, e); return
        }

        if (isTwoHanded) {
          // 2H weapon: no shield, no other weapon
          if (equippedShieldItem) { showError(`${n} ist zweihändig — kein Schild möglich. Lege ${equippedShieldItem.name} zuerst ab.`, e); return }
          const otherWeapon = equippedWeapons[0]
          if (otherWeapon) { showError(`${n} ist zweihändig — keine zweite Waffe möglich. Lege ${otherWeapon.name} zuerst ab.`, e); return }
        } else if (isRanged) {
          // Ranged: only 1 ranged weapon at a time
          if (equippedRangedWeapons.length >= 1) {
            showError(`Bereits eine Fernkampfwaffe angelegt (${equippedRangedWeapons[0].name}). Nur eine Fernkampfwaffe gleichzeitig möglich.`, e)
            return
          }
        } else {
          // One-handed melee weapon
          if (!hasBeidhaendigSF) {
            // Without Beidhändiger Kampf: max 1 melee weapon
            if (equippedMeleeWeapons.length >= 1) {
              showError(`Bereits eine Nahkampfwaffe angelegt (${equippedMeleeWeapons[0].name}). Ohne "Beidhändiger Kampf" nur eine Waffe möglich.`, e)
              return
            }
          } else {
            // With Beidhändiger Kampf: max 2 melee weapons, but not with shield
            if (equippedShieldItem) {
              showError(`Schild belegt die Nebenhand. Lege ${equippedShieldItem.name} ab um eine zweite Waffe zu führen.`, e)
              return
            }
            if (equippedMeleeWeapons.length >= 2) {
              showError('Bereits zwei Nahkampfwaffen angelegt. Lege eine zuerst ab.', e)
              return
            }
          }
          // Check if existing weapon is 2H
          const equipped2H = equippedMeleeWeapons.find(i => {
            const wm2 = (cv.weapons || []).find(w => i.name.toLowerCase().includes(w.name.toLowerCase().split(' ')[0]))
            const wt2 = weaponTemplates.find(t => i.name.toLowerCase().includes(t.name.toLowerCase().split(' ')[0]))
            return wm2?.two_handed || wt2?.two_handed
          })
          if (equipped2H) { showError(`${equipped2H.name} ist zweihändig — keine zweite Waffe möglich. Lege diese zuerst ab.`, e); return }
        }
      }
    }
    allItems = allItems.map(i => i.name === itemName ? { ...i, equipped: equipping } : i)
    const newInv = { ...invObj, items: allItems }
    setMyCharacter({ ...myCharacter, basis_inventory: newInv })
    setEquipError(null) // clear any previous error
    if (token && myCharacter.id) {
      fetch(`/api/characters/${myCharacter.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ basis_inventory: newInv }),
      }).catch(err => console.error('Failed to persist inventory:', err))
    }
  }

  if (!myCharacter) return <div className="text-center py-8 text-dsa-parchment-dark text-sm">Kein Charakter geladen.</div>

  // ── Derived Data ──
  const cv = myCharacter.combat_values || {}
  const dv = myCharacter.derived_values || {}
  const attrs = myCharacter.attributes || {}
  const specials = myCharacter.special_abilities || []
  const rawInv = myCharacter.basis_inventory || []
  const items = Array.isArray(rawInv) ? rawInv : (rawInv.items || [])
  const weapons = cv.weapons || []
  const charCT = myCharacter.combat_techniques || {}
  const vitals = getVitals()

  // Data-driven flags
  const hasAsP = (dv.AsP_max || 0) > 0
  const hasKaP = (dv.KaP_max || 0) > 0
  const tradition = specials.find(s => /^Tradition\s*\(/i.test(s))
  const traditionName = tradition ? tradition.replace(/^Tradition\s*\(\s*/, '').replace(/\)\s*$/, '') : null

  const meleeWeapons = weapons.filter(w => !w.ranged)
  const rangedWeapons = weapons.filter(w => w.ranged)
  const ammoItems = items.filter(i => /pfeil|bolzen|kugel|nadel|munition/i.test(i.name))
  const hasMelee = meleeWeapons.length > 0
  const hasRanged = rangedWeapons.length > 0
  const hasArmor = items.some(i => isArmorItem(i.name) || isHelmItem(i.name) || isShieldItem(i.name))
  const focusItem = items.find(i => isFocusItem(i.name))
  const focusWeapon = focusItem ? weapons.find(w => focusItem.name.toLowerCase().includes(w.name.toLowerCase().split(' ')[0])) : null
  const showRangedFirst = rangedWeapons.length > meleeWeapons.length

  // Computed combat values
  const equippedArmor = items.filter(i => (isArmorItem(i.name) || isHelmItem(i.name)) && i.equipped)
  const equippedShield = items.find(i => isShieldItem(i.name) && i.equipped)

  // Dual-wield detection (after equippedShield is defined)
  const hasBeidhaendig = specials.some(s => /beidh/i.test(s))
  const equippedMeleeWeapons = items.filter(i => isWeaponItem(i.name) && i.equipped).map(inv => {
    const m = meleeWeapons.find(w => inv.name.toLowerCase().includes(w.name.toLowerCase().split(' ')[0]))
    return m ? { inv, weapon: m } : null
  }).filter(Boolean).filter(e => !e.weapon.ranged)
  const isDualWielding = hasBeidhaendig && equippedMeleeWeapons.length >= 2 && !equippedShield
  const effectiveMainHand = isDualWielding
    ? (mainHandWeapon && equippedMeleeWeapons.some(e => e.weapon.name === mainHandWeapon) ? mainHandWeapon : equippedMeleeWeapons[0]?.weapon.name)
    : equippedMeleeWeapons[0]?.weapon.name || null
  const shieldTpl = equippedShield ? matchShield(equippedShield.name) : null
  const shieldPA = equippedShield ? (equippedShield.pa_mod ?? shieldTpl?.pa_mod ?? 0) : 0
  const shieldAT = equippedShield ? (equippedShield.at_mod ?? shieldTpl?.at_mod ?? 0) : 0
  const computedRS = equippedArmor.reduce((s, a) => s + (a.rs ?? matchArmor(a.name)?.rs ?? 0), 0)
  const computedBE = equippedArmor.reduce((s, a) => s + (a.be ?? matchArmor(a.name)?.be ?? 0), 0)
  const beRed = specials.some(s => /stungsgew.*II/i.test(s)) ? 2 : specials.some(s => /stungsgew/i.test(s)) ? 1 : 0
  const effBE = Math.max(0, computedBE - beRed)

  const kk = attrs.KK || 0
  const kkBonus = Math.max(0, Math.floor((kk - 15) / 3))
  const hasScharfsch = specials.some(s => /Scharfsch/i.test(s))

  // Kampftechniken — merge character's learned + all from DB (unlearned = base 6)
  const normName = s => s.toLowerCase().replace(/[\u00e4\u00f6\u00fc\u00df]/g, m => ({ '\u00e4':'ae','\u00f6':'oe','\u00fc':'ue','\u00df':'ss' }[m]||m))
  const kampftechniken = {}
  for (const tpl of combatTechTemplates) {
    const le = tpl.primary_attribute ? tpl.primary_attribute.join('/') : '?'
    const isR = tpl.category === 'fernkampf'
    const leA = (tpl.primary_attribute || [])[0]
    const sb = leA && attrs[leA] ? Math.max(0, Math.floor((attrs[leA] - 15) / 3)) : 0
    kampftechniken[tpl.name] = { name: tpl.name, le, stf: tpl.improvement_cost || '?', ktw: 6, isRanged: isR, at: isR ? null : 6, fk: isR ? 6 : null, pa: isR ? null : 3, sb, learned: false }
  }
  for (const [tn, ktw] of Object.entries(charCT)) {
    const tpl = combatTechTemplates.find(t => normName(t.name) === normName(tn) || t.name.toLowerCase() === tn.toLowerCase())
    const key = tpl?.name || tn
    const le = tpl?.primary_attribute ? tpl.primary_attribute.join('/') : kampftechniken[key]?.le || '?'
    const isR = tpl?.category === 'fernkampf'
    const leA = (tpl?.primary_attribute || [])[0]
    const sb = leA && attrs[leA] ? Math.max(0, Math.floor((attrs[leA] - 15) / 3)) : 0
    kampftechniken[key] = { name: key, le, stf: tpl?.improvement_cost || '?', ktw, isRanged: isR, at: isR ? null : ktw, fk: isR ? ktw : null, pa: isR ? null : Math.floor(ktw / 2), sb, learned: true }
  }

  // Helper: look up KTW for a weapon's technique (returns { ktw, learned })
  const getKTW = (technique) => {
    if (!technique) return { ktw: 6, learned: false }
    const kt = Object.values(kampftechniken).find(k => normName(k.name) === normName(technique) || k.name.toLowerCase() === technique.toLowerCase())
    return kt ? { ktw: kt.ktw, learned: kt.learned } : { ktw: 6, learned: false }
  }

  // Primary weapons (equipped)
  const equippedWeaponItems = items.filter(i => isWeaponItem(i.name) && i.equipped)
  const primaryWeapon = (() => {
    for (const inv of equippedWeaponItems) { const m = weapons.find(w => inv.name.toLowerCase().includes(w.name.toLowerCase().split(' ')[0])); if (m && !m.ranged) return m }
    return null
  })()
  const primaryRanged = (() => {
    for (const inv of equippedWeaponItems) { const m = weapons.find(w => inv.name.toLowerCase().includes(w.name.toLowerCase().split(' ')[0])); if (m && m.ranged) return m }
    return null
  })()

  // Centralized combat values (Kampfwerte displayed in global header, not here)
  const compRS = centralCV?.rs ?? computedRS
  const compBE = centralCV?.be ?? effBE
  const compSB = centralCV?.schadensbonus ?? kkBonus

  const combatSFs = specials.filter(s => /wucht|finte|schild|stung|ausweich|kampf|scharf|schnell|parade|beid|reflexe|gesp/i.test(s))

  // ── Weapon Row ──
  const WeaponRow = ({ w, id, isRanged: ranged }) => {
    // Match inventory item: try exact-ish name match first, then first-word match, then any weapon item containing the weapon name
    const wNameLow = w.name.toLowerCase()
    const wFirst = wNameLow.split(' ')[0]
    const inv = items.find(it => {
      const n = it.name.toLowerCase()
      return n === wNameLow || n.includes(wFirst) || wNameLow.includes(n.split(' ')[0])
    })
    const isEq = inv?.equipped !== false
    const isFocus = inv && isFocusItem(inv.name)

    return (
      <div className={clsx(
        'border-l-2 transition-colors',
        isEq
          ? (isFocus ? 'border-l-purple-400' : ranged ? 'border-l-emerald-400' : 'border-l-dsa-gold')
          : 'border-l-dsa-bg-medium',
      )}>
        {/* Row */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-2 cursor-pointer hover:bg-dsa-bg-light/30 transition-colors"
          onClick={() => setDetailPopup({ type: 'weapon', key: w.name, ranged })}
        >
          <EquipSlot equipped={isEq} onClick={e => { e.stopPropagation(); toggleEquip(inv?.name || w.name, e) }} />

          {/* Name */}
          <div className="flex-1 min-w-0">
            <span className="text-xs font-bold text-dsa-parchment truncate block">{w.name}</span>
            {/* Inline badges */}
            <div className="flex items-center gap-1 mt-0.5">
              {isDualWielding && !ranged && isEq && (
                w.name === effectiveMainHand
                  ? <span className="text-[9px] bg-dsa-gold/20 text-dsa-gold px-1 py-px rounded-sm border border-dsa-gold/20 font-bold">Haupthand</span>
                  : <button onClick={e => { e.stopPropagation(); setMainHandWeapon(w.name) }} className="text-[9px] bg-dsa-bg-medium text-dsa-parchment-dark px-1 py-px rounded-sm border border-dsa-bg-medium hover:text-dsa-gold hover:border-dsa-gold/30 transition-colors">Nebenhand</button>
              )}
              {isFocus && <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1 py-px rounded-sm border border-purple-500/20 font-bold">Fokus</span>}
              {w.two_handed && <span className="text-[9px] bg-amber-900/20 text-amber-400 px-1 py-px rounded-sm border border-amber-800/20 font-bold">2H</span>}
              {w.damage_type && <span className="text-[9px] text-dsa-parchment-dark/40">{DMG_ICON[w.damage_type] || ''} {w.damage_type}</span>}
              {(w.properties||[]).slice(0, 2).map((p, j) => (
                <span key={j} className={clsx('px-1 py-px rounded-sm border text-[9px]', PROP_STYLE[p]?.bg || 'bg-dsa-bg-medium text-dsa-parchment-dark border-dsa-bg-medium')}>{p}</span>
              ))}
            </div>
          </div>

          {/* Technique */}
          {(() => {
            const ki = getKTW(w.technique)
            const cAT = ki.ktw + (w.at_mod || 0)
            const cPA = Math.floor(ki.ktw / 2) + (w.pa_mod || 0)
            const cFK = ki.ktw + (w.at_mod || 0)
            return <>
              <div className={clsx('w-16 text-center text-[10px] truncate', ki.learned ? 'text-dsa-parchment-dark' : 'text-amber-400/60')}>{w.technique}{!ki.learned && ' *'}</div>
              {!ranged && <div className="w-9 text-center text-sm font-mono font-bold text-red-400">{cAT}</div>}
              {!ranged && <div className="w-9 text-center text-sm font-mono font-bold text-blue-400">{cPA}</div>}
              {ranged && <div className="w-9 text-center text-sm font-mono font-bold text-emerald-400">{cFK}</div>}
            </>
          })()}
          {/* TP */}
          <div className="w-14 text-center text-sm font-mono font-bold text-dsa-gold">
            {w.TP || w.damage}{!ranged && compSB > 0 && <span className="text-green-400 text-[9px]">+{compSB}</span>}
          </div>
          <ChevronRight className="w-3 h-3 text-dsa-parchment-dark/20 flex-shrink-0" />
        </div>

        {/* Expanded detail */}
      </div>
    )
  }

  // ── Section: Weapons ──
  const WeaponSection = ({ title, icon: Icon, headerClass, iconClass, textClass, ws, idPrefix, isRanged }) => (
    <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
      <div className={clsx('flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50', headerClass)}>
        <Icon className={clsx('w-4 h-4', iconClass)} />
        <span className={clsx('text-xs font-bold uppercase tracking-wider', textClass)}>{title}</span>
        <span className="text-[10px] text-dsa-parchment-dark/40 font-mono">{ws.length}</span>
      </div>
      {/* Column headers */}
      {ws.length > 0 && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-dsa-bg-medium/20 text-[9px] text-dsa-parchment-dark/40 uppercase font-bold">
          <div className="w-5" />
          <div className="flex-1">Waffe</div>
          <div className="w-16 text-center">Technik</div>
          {!isRanged && <div className="w-9 text-center cursor-help" title="Attacke — Angriffswert für Nahkampf">AT</div>}
          {!isRanged && <div className="w-9 text-center cursor-help" title="Parade — Verteidigungswert mit Waffe">PA</div>}
          {isRanged && <div className="w-9 text-center cursor-help" title="Fernkampf — Angriffswert für Fernkampfwaffen">FK</div>}
          <div className="w-14 text-center cursor-help" title="Trefferpunkte — Grundschaden der Waffe (z.B. 1W6+4)">TP</div>
          <div className="w-5" />
        </div>
      )}
      <div className="divide-y divide-dsa-bg-medium/20">
        {ws.map((w, i) => <WeaponRow key={i} w={w} id={`${idPrefix}${i}`} isRanged={isRanged} />)}
        {ws.length === 0 && <div className="px-3 py-3 text-xs text-dsa-parchment-dark/30 text-center italic">Keine</div>}
      </div>
      {/* Ammo under ranged */}
      {isRanged && ammoItems.length > 0 && (
        <div className="border-t border-dsa-bg-medium/30 px-3 py-1.5 flex gap-3">
          {ammoItems.map((a, i) => (
            <span key={i} className="text-xs text-dsa-parchment-dark flex items-center gap-1">
              <span className="text-emerald-400/60">{'\u25B8'}</span> {a.name}: <span className="font-mono font-bold text-dsa-parchment">{a.quantity}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="h-full overflow-y-auto animate-fade-in">

      {/* ━━ COMBAT SUMMARY ━━ */}
      <div className="bg-dsa-bg-card border-b border-dsa-bg-medium px-4 py-3">
        {/* Tradition row */}
        {(traditionName || hasAsP || hasKaP) && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {traditionName && (
              <span className="flex items-center gap-1.5">
                <Sparkles className={clsx('w-4 h-4', hasAsP ? 'text-dsa-mana' : hasKaP ? 'text-dsa-karma' : 'text-dsa-parchment-dark')} />
                <span className={clsx('text-xs font-display font-bold', hasAsP ? 'text-dsa-mana-light' : hasKaP ? 'text-dsa-karma-light' : 'text-dsa-parchment-dark')}>
                  {traditionName}
                </span>
              </span>
            )}
            {hasAsP && (
              <div className="flex items-center gap-1.5 bg-dsa-mana/15 border border-dsa-mana/25 rounded-sm px-2.5 py-1">
                <span className="text-[10px] text-dsa-mana font-bold uppercase cursor-help" title="Astralpunkte — magische Energie zum Zaubern. Regeneriert bei Rast.">AsP</span>
                <span className="text-sm font-mono font-bold text-dsa-mana-light">{vitals.asp}</span>
                <span className="text-[10px] text-dsa-mana/60">/ {vitals.aspMax}</span>
              </div>
            )}
            {hasKaP && (
              <div className="flex items-center gap-1.5 bg-dsa-karma/15 border border-dsa-karma/25 rounded-sm px-2.5 py-1">
                <span className="text-[10px] text-dsa-karma font-bold uppercase cursor-help" title="Karmapunkte — göttliche Energie zum Wirken von Liturgien. Regeneriert bei Rast.">KaP</span>
                <span className="text-sm font-mono font-bold text-dsa-karma-light">{vitals.kap}</span>
                <span className="text-[10px] text-dsa-karma/60">/ {vitals.kapMax}</span>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Floating Equip Error (click to dismiss) ── */}
      {equipError && (
        <div
          className="fixed z-50 w-64 animate-fade-in cursor-pointer"
          style={{ top: equipError.top, left: Math.max(8, Math.min(equipError.left, window.innerWidth - 272)) }}
          onClick={() => setEquipError(null)}
        >
          <div className="bg-red-950 border border-red-800/60 rounded-sm shadow-xl px-3 py-2.5 flex items-start gap-2">
            <Shield className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-200 flex-1 leading-relaxed">{equipError.message}</p>
          </div>
        </div>
      )}

      {/* ━━ MAIN CONTENT ━━ */}
      <div className="p-3 space-y-3">

        {/* ── Focus Item ── */}
        {focusItem && (
          <div className={clsx(
            'border rounded overflow-hidden',
            focusItem.equipped
              ? 'bg-gradient-to-r from-purple-900/20 to-dsa-bg-card border-purple-500/30'
              : 'bg-dsa-bg-card border-dsa-bg-medium'
          )}>
            <div className="flex items-center gap-3 px-3 py-2.5">
              <Sparkles className={clsx('w-5 h-5 flex-shrink-0', focusItem.equipped ? 'text-purple-400' : 'text-purple-400/40')} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-dsa-parchment">{focusItem.name}</span>
                </div>
                {focusWeapon && (
                  <div className="flex items-center gap-3 mt-0.5 text-[10px]">
                    <span className="text-dsa-parchment-dark">AT <span className="font-mono text-red-400">{focusWeapon.AT}</span></span>
                    <span className="text-dsa-parchment-dark">PA <span className="font-mono text-blue-400">{focusWeapon.PA}</span></span>
                    <span className="text-dsa-parchment-dark">TP <span className="font-mono text-dsa-gold">{focusWeapon.TP||focusWeapon.damage}</span></span>
                    <span className="text-dsa-parchment-dark/40">{focusWeapon.technique}</span>
                  </div>
                )}
              </div>
              <EquipSlot equipped={focusItem.equipped} onClick={e => toggleEquip(focusItem.name, e)} size="lg" />
            </div>
          </div>
        )}

        {/* ── Nahkampf | Fernkampf | Schutz — side by side ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Nahkampf */}
          {hasMelee ? (
            <WeaponSection title="Nahkampf" icon={Swords} headerClass="bg-red-950/50" iconClass="text-red-400" textClass="text-red-400" ws={meleeWeapons} idPrefix="m" />
          ) : (
            <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50 bg-red-950/50">
                <Swords className="w-4 h-4 text-red-400" />
                <span className="text-[11px] text-red-400 font-semibold uppercase tracking-wider">Nahkampf</span>
              </div>
              <div className="px-3 py-4 text-center text-xs text-dsa-parchment-dark/30 italic">Keine Nahkampfwaffen</div>
            </div>
          )}

          {/* Fernkampf */}
          {hasRanged ? (
            <WeaponSection title="Fernkampf" icon={Crosshair} headerClass="bg-emerald-950/50" iconClass="text-emerald-400" textClass="text-emerald-400" ws={rangedWeapons} idPrefix="r" isRanged />
          ) : (
            <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50 bg-emerald-950/50">
                <Crosshair className="w-4 h-4 text-emerald-400" />
                <span className="text-[11px] text-emerald-400 font-semibold uppercase tracking-wider">Fernkampf</span>
              </div>
              <div className="px-3 py-4 text-center text-xs text-dsa-parchment-dark/30 italic">Keine Fernkampfwaffen</div>
            </div>
          )}

          {/* Schutz */}
          <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50 bg-amber-950/50">
              <Shield className="w-4 h-4 text-dsa-gold" />
              <span className="text-[11px] text-dsa-gold font-semibold uppercase tracking-wider">Schutz</span>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[10px]"><span className="text-dsa-parchment-dark/50">RS</span> <span className="font-mono font-bold text-dsa-gold">{compRS}</span></span>
                <span className="text-[10px]"><span className="text-dsa-parchment-dark/50">BE</span> <span className={clsx('font-mono font-bold', compBE > 0 ? 'text-amber-400' : 'text-dsa-parchment-dark/30')}>{compBE}</span></span>
              </div>
            </div>

            {/* Column headers */}
            {hasArmor && (
              <div className="flex items-center gap-2 px-2 py-1 bg-dsa-bg-medium/20 text-[9px] text-dsa-parchment-dark/40 uppercase font-bold">
                <div className="w-5" />
                <div className="flex-1">Gegenstand</div>
                <div className="w-10 text-center cursor-help" title="Rüstungsschutz (Rüstung) bzw. Parade-Bonus (Schild)">RS / PA</div>
                <div className="w-10 text-center cursor-help" title="Behinderung (Rüstung) bzw. AT-Malus (Schild)">BE / AT</div>
                <div className="w-3" />
              </div>
            )}
            <div className="p-2 space-y-1.5">
              {/* Ruestung */}
              {(() => {
                const armorItems = items.filter(i => isArmorItem(i.name) || isHelmItem(i.name))
                if (armorItems.length === 0) return null
                return armorItems.map((a, i) => {
                  const tpl = matchArmor(a.name)
                  return (
                    <div key={`a${i}`} className={clsx('flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-dsa-bg-light/20 transition-colors cursor-pointer border-l-2', a.equipped ? 'border-l-dsa-gold' : 'border-l-transparent')} onClick={() => setDetailPopup({ type: 'armor', key: a.name })}>
                      <EquipSlot equipped={a.equipped} onClick={e => { e.stopPropagation(); toggleEquip(a.name, e) }} />
                      <span className="text-xs flex-1 font-medium text-dsa-parchment truncate">
                        {a.name}
                        {isHelmItem(a.name) && <span className="ml-1 text-[9px] text-dsa-parchment-dark bg-dsa-bg-medium px-1 py-px rounded-sm uppercase font-bold">Helm</span>}
                      </span>
                      <span className="w-10 text-center text-[10px] font-mono font-bold text-dsa-gold">{a.rs??tpl?.rs??'\u2014'}</span>
                      <span className="w-10 text-center text-[10px] font-mono text-amber-400/60">{a.be??tpl?.be??'\u2014'}</span>
                      <ChevronRight className="w-3 h-3 text-dsa-parchment-dark/20 flex-shrink-0" />
                    </div>
                  )
                })
              })()}

              {/* Schilde */}
              {(() => {
                const shieldItems = items.filter(i => isShieldItem(i.name))
                if (shieldItems.length === 0) return null
                return shieldItems.map((a, i) => {
                  const tpl = matchShield(a.name)
                  return (
                    <div key={`s${i}`} className={clsx('flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-dsa-bg-light/20 transition-colors cursor-pointer border-l-2', a.equipped ? 'border-l-blue-400' : 'border-l-transparent')} onClick={() => setDetailPopup({ type: 'shield', key: a.name })}>
                      <EquipSlot equipped={a.equipped} onClick={e => { e.stopPropagation(); toggleEquip(a.name, e) }} />
                      <span className="text-xs flex-1 font-medium text-dsa-parchment truncate">{a.name}</span>
                      <span className="w-10 text-center text-[10px] font-mono font-bold text-blue-400">+{a.pa_mod??tpl?.pa_mod??'?'}</span>
                      <span className="w-10 text-center text-[10px] font-mono text-red-400/50">{a.at_mod??tpl?.at_mod??'0'}</span>
                      <ChevronRight className="w-3 h-3 text-dsa-parchment-dark/20 flex-shrink-0" />
                    </div>
                  )
                })
              })()}

              {!hasArmor && (
                <div className="px-1 py-3 text-center text-xs text-dsa-parchment-dark/30 italic">RS 0, BE 0</div>
              )}

              {beRed > 0 && (
                <div className="px-2 py-1 text-[9px] text-green-400/60 border-t border-dsa-bg-medium/20">
                  Rüst.gew. {beRed > 1 ? 'II' : 'I'}: BE -{beRed}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Kampftechniken + Kampf-SF (side by side) ── */}
        {(Object.keys(kampftechniken).length > 0 || combatSFs.length > 0) && (
          <div className={clsx('grid gap-3', Object.keys(kampftechniken).length > 0 && combatSFs.length > 0 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1')}>

            {/* Kampftechniken — full table */}
            {Object.keys(kampftechniken).length > 0 && (
              <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50 bg-dsa-gold/10">
                  <Target className="w-4 h-4 text-dsa-gold" />
                  <span className="text-xs text-dsa-gold font-bold uppercase tracking-wider">Kampftechniken</span>
                  <span className="text-[10px] font-mono text-dsa-parchment-dark/40">{Object.values(kampftechniken).filter(k => k.learned).length} gelernt / {Object.keys(kampftechniken).length}</span>
                </div>
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-x-2 px-3 py-1 bg-dsa-bg-medium/20 text-[9px] text-dsa-parchment-dark/40 uppercase font-bold">
                  <div>Technik</div>
                  <div className="w-12 text-center cursor-help" title="Nahkampf oder Fernkampf">Typ</div>
                  <div className="w-16 text-center cursor-help" title="Leiteigenschaft — das Attribut das den Schadensbonus bestimmt">LE</div>
                  <div className="w-8 text-center cursor-help" title="Steigerungsfaktor — wie teuer die Technik zu steigern ist (A=günstig, E=teuer)">StF</div>
                  <div className="w-8 text-center cursor-help" title="Kampftechnikwert — Grundwert der Kampftechnik, bestimmt AT und PA">KTW</div>
                  <div className="w-8 text-center cursor-help" title="Attacke (Nahkampf) oder Fernkampfwert">AT/FK</div>
                  <div className="w-8 text-center cursor-help" title="Parade — Verteidigungswert (nur Nahkampf)">PA</div>
                </div>
                <div className="divide-y divide-dsa-bg-medium/15 max-h-64 overflow-y-auto">
                  {/* Learned first, then unlearned */}
                  {Object.values(kampftechniken).sort((a, b) => (b.learned ? 1 : 0) - (a.learned ? 1 : 0) || a.name.localeCompare(b.name)).map(kt => (
                    <div
                      key={kt.name}
                      className={clsx('grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-x-2 items-center px-3 py-1.5 hover:bg-dsa-bg-light/15 transition-colors', !kt.learned && 'opacity-40')}
                    >
                      <div className="text-xs font-medium truncate">
                        <span className={kt.learned ? 'text-dsa-parchment' : 'text-dsa-parchment-dark'}>{kt.name}</span>
                        {!kt.learned && <span className="text-[9px] text-dsa-parchment-dark/50 ml-1">(ungelernt)</span>}
                      </div>
                      <div className="w-12 text-center">
                        <span className={clsx('text-[9px] font-bold', kt.isRanged ? 'text-emerald-400' : 'text-red-400')}>{kt.isRanged ? 'Fern' : 'Nah'}</span>
                      </div>
                      <div className="w-16 text-center text-[10px] text-dsa-parchment-dark">
                        {kt.le.split('/').map((a, i) => (
                          <span key={i}>{i > 0 && '/'}{a}{attrs[a] ? <span className="text-dsa-parchment font-mono text-[9px]"> {attrs[a]}</span> : ''}</span>
                        ))}
                      </div>
                      <div className="w-8 text-center text-[10px] text-dsa-parchment-dark">{kt.stf}</div>
                      <div className={clsx('w-8 text-center text-xs font-mono font-bold', kt.learned ? 'text-dsa-gold' : 'text-dsa-parchment-dark/50')}>{kt.ktw}</div>
                      <div className={clsx('w-8 text-center text-xs font-mono font-bold', kt.learned ? 'text-red-400' : 'text-dsa-parchment-dark/50')}>{kt.isRanged ? kt.fk : kt.at}</div>
                      <div className={clsx('w-8 text-center text-xs font-mono font-bold', kt.learned ? 'text-blue-400' : 'text-dsa-parchment-dark/50')}>{kt.pa ?? '\u2014'}</div>
                    </div>
                  ))}
                </div>
                <div className="px-3 py-1 border-t border-dsa-bg-medium/20 text-[9px] text-dsa-parchment-dark/30">
                  AT = KTW + Waffenmod · PA = KTW/2 + Waffenmod · SB = (LE - 15) / 3
                </div>
              </div>
            )}

            {/* Kampf-Sonderfertigkeiten — scrollable cards */}
            {combatSFs.length > 0 && (
              <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50 bg-purple-950/50">
                  <Zap className="w-4 h-4 text-purple-400" />
                  <span className="text-xs text-purple-400 font-bold uppercase tracking-wider">Kampf-SF</span>
                  <span className="text-[10px] font-mono text-dsa-parchment-dark/40">{combatSFs.length}</span>
                </div>
                <div className="overflow-y-auto max-h-64 p-2 space-y-1.5">
                  {combatSFs.map((sf, i) => {
                    const engine = Object.entries(COMBAT_SPECIAL_ABILITIES).find(([k]) => sf.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(sf.toLowerCase()))
                    const data = engine ? engine[1] : null
                    const explain = Object.entries(SF_EXPLAIN).find(([k]) => sf.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(sf.toLowerCase()))
                    const explainText = explain ? explain[1] : null
                    return (
                      <div
                        key={i}
                        className="bg-dsa-bg-light/30 border border-purple-900/20 rounded-sm p-2.5 hover:border-purple-500/30 transition-colors cursor-pointer"
                        onClick={() => setDetailPopup({ type: 'sf', key: sf })}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-dsa-parchment">{sf}</span>
                          <ChevronRight className="w-3 h-3 text-dsa-parchment-dark/20 flex-shrink-0" />
                        </div>
                        {/* Stat modifiers as inline badges */}
                        {data && (
                          <div className="flex flex-wrap gap-1 mb-1.5">
                            {data.atMod != null && data.atMod !== 0 && (
                              <span className="text-[10px] font-mono font-bold text-red-400 bg-red-900/20 px-1.5 py-0.5 rounded-sm">AT {data.atMod > 0 ? '+' : ''}{data.atMod}</span>
                            )}
                            {data.tpMod != null && data.tpMod !== 0 && (
                              <span className="text-[10px] font-mono font-bold text-dsa-gold bg-dsa-gold/10 px-1.5 py-0.5 rounded-sm">TP +{data.tpMod}</span>
                            )}
                            {data.defMod != null && (
                              <span className="text-[10px] font-mono font-bold text-blue-400 bg-blue-900/20 px-1.5 py-0.5 rounded-sm">Gegner {data.defMod}</span>
                            )}
                            {data.paBonus != null && (
                              <span className="text-[10px] font-mono font-bold text-blue-400 bg-blue-900/20 px-1.5 py-0.5 rounded-sm">PA +{data.paBonus}</span>
                            )}
                            {data.awBonus != null && (
                              <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-900/20 px-1.5 py-0.5 rounded-sm">AW +{data.awBonus}</span>
                            )}
                            {data.beReduction != null && (
                              <span className="text-[10px] font-mono font-bold text-green-400 bg-green-900/20 px-1.5 py-0.5 rounded-sm">BE -{data.beReduction}</span>
                            )}
                            {data.iniBonus != null && (
                              <span className="text-[10px] font-mono font-bold text-dsa-parchment bg-dsa-bg-medium px-1.5 py-0.5 rounded-sm">INI +{data.iniBonus}</span>
                            )}
                            {data.halveRS && (
                              <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-900/20 px-1.5 py-0.5 rounded-sm">RS /2</span>
                            )}
                            {data.tpMultiplier != null && data.tpMultiplier > 1 && (
                              <span className="text-[10px] font-mono font-bold text-dsa-gold bg-dsa-gold/10 px-1.5 py-0.5 rounded-sm">x{data.tpMultiplier}</span>
                            )}
                            {data.offhandAttack && (
                              <span className="text-[10px] font-mono font-bold text-red-400 bg-red-900/20 px-1.5 py-0.5 rounded-sm">Nebenhand {data.offhandMod}</span>
                            )}
                            {data.fkMod != null && data.fkMod > 0 && (
                              <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-900/20 px-1.5 py-0.5 rounded-sm">Distanz -{data.fkMod}</span>
                            )}
                            {data.reloadReduction != null && (
                              <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-900/20 px-1.5 py-0.5 rounded-sm">Laden -{data.reloadReduction}</span>
                            )}
                            {data.oncePerCombat && (
                              <span className="text-[10px] font-bold text-amber-400 bg-amber-900/20 px-1.5 py-0.5 rounded-sm">1x/Kampf</span>
                            )}
                            {data.surpriseImmune && (
                              <span className="text-[10px] font-bold text-green-400 bg-green-900/20 px-1.5 py-0.5 rounded-sm">Immun: Überraschung</span>
                            )}
                            {data.extraParade && (
                              <span className="text-[10px] font-bold text-blue-400 bg-blue-900/20 px-1.5 py-0.5 rounded-sm">+1 Parade/KR</span>
                            )}
                            {data.extraShot && (
                              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-900/20 px-1.5 py-0.5 rounded-sm">+1 Schuss/KR</span>
                            )}
                          </div>
                        )}
                        {/* Short explanation */}
                        {explainText && (
                          <p className="text-[10px] text-dsa-parchment-dark leading-snug">{explainText}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DETAIL POPUPS ── */}

        {/* Weapon popup */}
        {detailPopup?.type === 'weapon' && (() => {
          const w = weapons.find(x => x.name === detailPopup.key)
          if (!w) return null
          const ranged = !!detailPopup.ranged
          // Compute real values from KTW lookup (not backend pre-computed)
          const ktwInfo = getKTW(w.technique)
          const realAT = ktwInfo.ktw + (w.at_mod || 0)
          const realPA = Math.floor(ktwInfo.ktw / 2) + (w.pa_mod || 0)
          const realFK = ktwInfo.ktw + (w.at_mod || 0)
          return (
            <DetailPopup title={w.name} onClose={() => setDetailPopup(null)} accentClass={ranged ? 'bg-emerald-950/50' : 'bg-red-950/50'}>
              <div className="space-y-3">
                {/* Unlearned warning */}
                {!ktwInfo.learned && (
                  <div className="bg-amber-900/20 border border-amber-800/30 rounded-sm px-3 py-2 text-[11px] text-amber-300">
                    Kampftechnik <strong>{w.technique}</strong> nicht gelernt! Basiswert 6 wird verwendet.
                  </div>
                )}
                {/* Stat cards — computed from real KTW */}
                <div className="flex flex-wrap gap-2">
                  {!ranged && (
                    <div className="bg-red-900/15 border border-red-900/20 rounded-sm px-3 py-2 text-center">
                      <div className="text-lg font-mono font-bold text-red-400">{realAT}</div>
                      <div className="text-[10px] text-dsa-parchment-dark/50">Attacke</div>
                    </div>
                  )}
                  {!ranged && (
                    <div className="bg-blue-900/15 border border-blue-900/20 rounded-sm px-3 py-2 text-center">
                      <div className="text-lg font-mono font-bold text-blue-400">{realPA}</div>
                      <div className="text-[10px] text-dsa-parchment-dark/50">Parade</div>
                    </div>
                  )}
                  {ranged && (
                    <div className="bg-emerald-900/15 border border-emerald-900/20 rounded-sm px-3 py-2 text-center">
                      <div className="text-lg font-mono font-bold text-emerald-400">{realFK}</div>
                      <div className="text-[10px] text-dsa-parchment-dark/50">Fernkampf</div>
                    </div>
                  )}
                  <div className="bg-dsa-gold/10 border border-dsa-gold/20 rounded-sm px-3 py-2 text-center">
                    <div className="text-lg font-mono font-bold text-dsa-gold">{w.TP || w.damage}</div>
                    <div className="text-[10px] text-dsa-parchment-dark/50">Trefferpunkte</div>
                  </div>
                  {!ranged && (
                    <div className="bg-green-900/15 border border-green-900/20 rounded-sm px-3 py-2 text-center">
                      <div className="text-lg font-mono font-bold text-green-400">+{compSB}</div>
                      <div className="text-[10px] text-dsa-parchment-dark/50">Schadensbonus</div>
                    </div>
                  )}
                </div>
                {/* Details + derivation */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-dsa-parchment-dark">Kampftechnik</span><span className="text-dsa-parchment">{w.technique} {ktwInfo.learned ? '' : <span className="text-amber-400">(ungelernt)</span>}</span></div>
                  <div className="flex justify-between"><span className="text-dsa-parchment-dark">Kampftechnikwert</span><span className={clsx('font-mono', ktwInfo.learned ? 'text-dsa-gold' : 'text-amber-400')}>{ktwInfo.ktw}{!ktwInfo.learned && ' (Basis)'}</span></div>
                  {!ranged && <div className="flex justify-between"><span className="text-dsa-parchment-dark">Reichweite</span><span className="text-dsa-parchment">{w.reach || '\u2014'}</span></div>}
                  {w.damage_type && <div className="flex justify-between"><span className="text-dsa-parchment-dark">Schadenstyp</span><span className="text-dsa-parchment">{DMG_ICON[w.damage_type] || ''} {w.damage_type}</span></div>}
                  {w.two_handed && <div className="flex justify-between"><span className="text-dsa-parchment-dark">Händigkeit</span><span className="text-amber-400 font-bold">Zweihändig</span></div>}
                </div>
                {/* Derivation formulas */}
                <div className="bg-dsa-bg/50 border border-dsa-bg-medium rounded-sm p-2.5 space-y-1 text-[10px] font-mono text-dsa-parchment-dark">
                  {!ranged && <div>Attacke = Kampftechnikwert <span className="text-dsa-gold">{ktwInfo.ktw}</span> + Waffenmod <span className="text-dsa-parchment">{w.at_mod>=0?'+':''}{w.at_mod||0}</span> = <span className="text-red-400 font-bold">{realAT}</span></div>}
                  {!ranged && <div>Parade = Kampftechnikwert/2 <span className="text-dsa-gold">{Math.floor(ktwInfo.ktw/2)}</span> + Waffenmod <span className="text-dsa-parchment">{w.pa_mod>=0?'+':''}{w.pa_mod||0}</span> = <span className="text-blue-400 font-bold">{realPA}</span></div>}
                  {ranged && <div>Fernkampf = Kampftechnikwert <span className="text-dsa-gold">{ktwInfo.ktw}</span> + Waffenmod <span className="text-dsa-parchment">{w.at_mod>=0?'+':''}{w.at_mod||0}</span> = <span className="text-emerald-400 font-bold">{realFK}</span></div>}
                  {!ranged && <div>Schadensbonus = (Körperkraft <span className="text-amber-400">{kk}</span> - 15) / 3 = <span className="text-green-400 font-bold">+{compSB}</span></div>}
                </div>
                {/* Range brackets */}
                {ranged && w.range_brackets && (
                  <div>
                    <div className="text-[10px] text-dsa-parchment-dark/50 uppercase font-bold mb-1">Distanzen</div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(w.range_brackets).map(([k, m]) => {
                        const mod = k==='nah'?-2:k==='mittel'?0:k==='weit'?-4:-8
                        const eff = hasScharfsch ? Math.min(0, mod+2) : mod
                        return (
                          <div key={k} className="bg-dsa-bg-light border border-dsa-bg-medium rounded-sm px-2.5 py-1.5 text-center">
                            <div className="text-[10px] text-dsa-parchment-dark/50 uppercase">{k}</div>
                            <div className="text-xs font-mono text-dsa-parchment">{m}m</div>
                            <div className={clsx('text-xs font-mono font-bold', eff===0?'text-green-400':'text-red-400')}>{eff>=0?'\u00B10':eff}</div>
                          </div>
                        )
                      })}
                      {w.reload_time != null && (
                        <div className="bg-dsa-bg-light border border-dsa-bg-medium rounded-sm px-2.5 py-1.5 text-center">
                          <div className="text-[10px] text-dsa-parchment-dark/50 uppercase">Laden</div>
                          <div className="text-xs font-mono text-amber-400">{w.reload_time} Akt.</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {/* Properties with explanations */}
                {(w.properties||[]).length > 0 && (
                  <div>
                    <div className="text-[10px] text-dsa-parchment-dark/50 uppercase font-bold mb-1">Eigenschaften</div>
                    <div className="space-y-1">
                      {w.properties.map((p, j) => {
                        const s = PROP_STYLE[p] || { bg: 'bg-dsa-bg-medium text-dsa-parchment-dark border-dsa-bg-medium', tip: p }
                        return (
                          <div key={j} className="flex items-start gap-2">
                            <span className={clsx('text-[10px] px-2 py-0.5 rounded-sm border flex-shrink-0', s.bg)}>{p}</span>
                            <span className="text-[11px] text-dsa-parchment-dark leading-snug">{s.tip}</span>
                          </div>
                        )
                      })}
                      {w.two_handed && (
                        <div className="flex items-start gap-2">
                          <span className="text-[10px] px-2 py-0.5 rounded-sm bg-amber-900/20 text-amber-400 border border-amber-800/20 flex-shrink-0">Zweihändig</span>
                          <span className="text-[11px] text-dsa-parchment-dark leading-snug">Benötigt beide Hände. Kein Schild oder zweite Waffe möglich.</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {/* Damage summary for melee */}
                {!ranged && (
                  <div className="bg-dsa-gold/10 border border-dsa-gold/15 rounded-sm px-3 py-2">
                    <span className="text-xs text-dsa-parchment">Schaden pro Treffer: </span>
                    <span className="text-sm font-mono font-bold text-dsa-gold">{w.TP||w.damage}{compSB>0?` + ${compSB}`:''}</span>
                    <span className="text-xs text-dsa-parchment"> - RS des Gegners</span>
                  </div>
                )}
              </div>
            </DetailPopup>
          )
        })()}

        {detailPopup?.type === 'sf' && (() => {
          const sfName = detailPopup.key
          const engine = Object.entries(COMBAT_SPECIAL_ABILITIES).find(([k]) => sfName.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(sfName.toLowerCase()))
          const data = engine ? engine[1] : null
          const explain = Object.entries(SF_EXPLAIN).find(([k]) => sfName.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(sfName.toLowerCase()))
          const explainText = explain ? explain[1] : null
          return (
            <DetailPopup title={sfName} onClose={() => setDetailPopup(null)} accentClass="bg-gradient-to-r from-purple-900/20 to-dsa-bg-light">
              <div className="space-y-3">
                {/* Mechanical effects */}
                {data && (
                  <div className="flex flex-wrap gap-2">
                    {data.atMod != null && data.atMod !== 0 && (
                      <div className="bg-red-900/15 border border-red-900/20 rounded-sm px-2.5 py-1.5 text-center">
                        <div className="text-sm font-mono font-bold text-red-400">{data.atMod > 0 ? '+' : ''}{data.atMod}</div>
                        <div className="text-[10px] text-dsa-parchment-dark/50">AT</div>
                      </div>
                    )}
                    {data.tpMod != null && data.tpMod !== 0 && (
                      <div className="bg-dsa-gold/10 border border-dsa-gold/20 rounded-sm px-2.5 py-1.5 text-center">
                        <div className="text-sm font-mono font-bold text-dsa-gold">+{data.tpMod}</div>
                        <div className="text-[10px] text-dsa-parchment-dark/50">TP</div>
                      </div>
                    )}
                    {data.defMod != null && (
                      <div className="bg-blue-900/15 border border-blue-900/20 rounded-sm px-2.5 py-1.5 text-center">
                        <div className="text-sm font-mono font-bold text-blue-400">{data.defMod}</div>
                        <div className="text-[10px] text-dsa-parchment-dark/50">Gegner PA</div>
                      </div>
                    )}
                    {data.paBonus != null && (
                      <div className="bg-blue-900/15 border border-blue-900/20 rounded-sm px-2.5 py-1.5 text-center">
                        <div className="text-sm font-mono font-bold text-blue-400">+{data.paBonus}</div>
                        <div className="text-[10px] text-dsa-parchment-dark/50">PA</div>
                      </div>
                    )}
                    {data.awBonus != null && (
                      <div className="bg-cyan-900/15 border border-cyan-900/20 rounded-sm px-2.5 py-1.5 text-center">
                        <div className="text-sm font-mono font-bold text-cyan-400">+{data.awBonus}</div>
                        <div className="text-[10px] text-dsa-parchment-dark/50">AW</div>
                      </div>
                    )}
                    {data.beReduction != null && (
                      <div className="bg-green-900/15 border border-green-900/20 rounded-sm px-2.5 py-1.5 text-center">
                        <div className="text-sm font-mono font-bold text-green-400">-{data.beReduction}</div>
                        <div className="text-[10px] text-dsa-parchment-dark/50">BE</div>
                      </div>
                    )}
                    {data.iniBonus != null && (
                      <div className="bg-dsa-bg-light border border-dsa-bg-medium rounded-sm px-2.5 py-1.5 text-center">
                        <div className="text-sm font-mono font-bold text-dsa-parchment">+{data.iniBonus}</div>
                        <div className="text-[10px] text-dsa-parchment-dark/50">INI</div>
                      </div>
                    )}
                    {data.halveRS && (
                      <div className="bg-amber-900/15 border border-amber-900/20 rounded-sm px-2.5 py-1.5 text-center">
                        <div className="text-sm font-mono font-bold text-amber-400">/2</div>
                        <div className="text-[10px] text-dsa-parchment-dark/50">RS</div>
                      </div>
                    )}
                    {data.tpMultiplier != null && data.tpMultiplier > 1 && (
                      <div className="bg-dsa-gold/10 border border-dsa-gold/20 rounded-sm px-2.5 py-1.5 text-center">
                        <div className="text-sm font-mono font-bold text-dsa-gold">x{data.tpMultiplier}</div>
                        <div className="text-[10px] text-dsa-parchment-dark/50">Schaden</div>
                      </div>
                    )}
                    {data.offhandAttack && (
                      <div className="bg-red-900/15 border border-red-900/20 rounded-sm px-2.5 py-1.5 text-center">
                        <div className="text-sm font-mono font-bold text-red-400">{data.offhandMod}</div>
                        <div className="text-[10px] text-dsa-parchment-dark/50">Nebenhand</div>
                      </div>
                    )}
                    {data.fkMod != null && data.fkMod > 0 && (
                      <div className="bg-emerald-900/15 border border-emerald-900/20 rounded-sm px-2.5 py-1.5 text-center">
                        <div className="text-sm font-mono font-bold text-emerald-400">-{data.fkMod}</div>
                        <div className="text-[10px] text-dsa-parchment-dark/50">Distanz</div>
                      </div>
                    )}
                    {data.reloadReduction != null && (
                      <div className="bg-emerald-900/15 border border-emerald-900/20 rounded-sm px-2.5 py-1.5 text-center">
                        <div className="text-sm font-mono font-bold text-emerald-400">-{data.reloadReduction}</div>
                        <div className="text-[10px] text-dsa-parchment-dark/50">Ladezeit</div>
                      </div>
                    )}
                    {data.oncePerCombat && <Badge variant="warning" size="sm">1x pro Kampf</Badge>}
                    {data.surpriseImmune && <Badge variant="success" size="sm">Immun: Überraschung</Badge>}
                    {data.extraParade && <Badge variant="mana" size="sm">+1 Parade/KR</Badge>}
                    {data.extraShot && <Badge variant="success" size="sm">+1 Schuss/KR</Badge>}
                  </div>
                )}
                {/* Explanation */}
                {explainText && (
                  <div className="bg-dsa-bg-light/30 border border-dsa-bg-medium rounded-sm p-2.5 text-[11px] text-dsa-parchment leading-relaxed">
                    {explainText}
                  </div>
                )}
                {/* Short rules text */}
                {data?.desc && (
                  <div className="text-[10px] text-dsa-parchment-dark/50 italic">{data.desc}</div>
                )}
              </div>
            </DetailPopup>
          )
        })()}

        {/* ── Armor Detail Popup ── */}
        {detailPopup?.type === 'armor' && (() => {
          const item = items.find(i => i.name === detailPopup.key)
          if (!item) return null
          const tpl = matchArmor(item.name)
          const rs = item.rs ?? tpl?.rs ?? 0
          const be = item.be ?? tpl?.be ?? 0
          const isHelm = isHelmItem(item.name)
          return (
            <DetailPopup title={item.name} onClose={() => setDetailPopup(null)} accentClass="bg-dsa-gold/10">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <div className="bg-dsa-gold/10 border border-dsa-gold/20 rounded-sm px-3 py-2 text-center">
                    <div className="text-lg font-mono font-bold text-dsa-gold">{rs}</div>
                    <div className="text-[10px] text-dsa-parchment-dark/50">Rüstungsschutz</div>
                  </div>
                  <div className="bg-amber-900/15 border border-amber-900/20 rounded-sm px-3 py-2 text-center">
                    <div className="text-lg font-mono font-bold text-amber-400">{be}</div>
                    <div className="text-[10px] text-dsa-parchment-dark/50">Behinderung</div>
                  </div>
                  {beRed > 0 && (
                    <div className="bg-green-900/15 border border-green-900/20 rounded-sm px-3 py-2 text-center">
                      <div className="text-lg font-mono font-bold text-green-400">{Math.max(0, be - beRed)}</div>
                      <div className="text-[10px] text-dsa-parchment-dark/50">Eff. BE (-{beRed})</div>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-dsa-parchment-dark">Typ</span><span className="text-dsa-parchment">{isHelm ? 'Helm' : 'Rüstung'}</span></div>
                  {tpl?.weight != null && <div className="flex justify-between"><span className="text-dsa-parchment-dark">Gewicht</span><span className="text-dsa-parchment font-mono">{tpl.weight} Stein</span></div>}
                  {tpl?.price != null && <div className="flex justify-between"><span className="text-dsa-parchment-dark">Preis</span><span className="text-dsa-parchment font-mono">{tpl.price} Silber</span></div>}
                  <div className="flex justify-between"><span className="text-dsa-parchment-dark">Status</span><span className={item.equipped ? 'text-dsa-gold font-bold' : 'text-dsa-parchment-dark'}>{item.equipped ? 'Angelegt' : 'Nicht angelegt'}</span></div>
                </div>
                <div className="bg-dsa-bg-light/30 border border-dsa-bg-medium rounded-sm p-2.5 text-[11px] text-dsa-parchment-dark leading-relaxed space-y-1">
                  <p><strong className="text-dsa-gold">RS (Rüstungsschutz)</strong> wird bei jedem Treffer vom Schaden abgezogen. Höher = weniger Schaden.</p>
                  <p><strong className="text-amber-400">BE (Behinderung)</strong> wird von AT, PA, AW, INI und GS abgezogen. Schwere Rüstung schützt mehr, behindert aber auch mehr.</p>
                  {isHelm && <p>Ein <strong className="text-dsa-parchment">Helm</strong> kann zusätzlich zur Körperrüstung getragen werden.</p>}
                </div>
              </div>
            </DetailPopup>
          )
        })()}

        {/* ── Shield Detail Popup ── */}
        {detailPopup?.type === 'shield' && (() => {
          const item = items.find(i => i.name === detailPopup.key)
          if (!item) return null
          const tpl = matchShield(item.name)
          const paMod = item.pa_mod ?? tpl?.pa_mod ?? 0
          const atMod = item.at_mod ?? tpl?.at_mod ?? 0
          return (
            <DetailPopup title={item.name} onClose={() => setDetailPopup(null)} accentClass="bg-blue-950/30">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <div className="bg-blue-900/15 border border-blue-900/20 rounded-sm px-3 py-2 text-center">
                    <div className="text-lg font-mono font-bold text-blue-400">+{paMod}</div>
                    <div className="text-[10px] text-dsa-parchment-dark/50">Parade-Bonus</div>
                  </div>
                  {atMod !== 0 && (
                    <div className="bg-red-900/15 border border-red-900/20 rounded-sm px-3 py-2 text-center">
                      <div className="text-lg font-mono font-bold text-red-400">{atMod}</div>
                      <div className="text-[10px] text-dsa-parchment-dark/50">AT-Malus</div>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-dsa-parchment-dark">Typ</span><span className="text-dsa-parchment">Schild</span></div>
                  {tpl?.weight != null && <div className="flex justify-between"><span className="text-dsa-parchment-dark">Gewicht</span><span className="text-dsa-parchment font-mono">{tpl.weight} Stein</span></div>}
                  {tpl?.price != null && <div className="flex justify-between"><span className="text-dsa-parchment-dark">Preis</span><span className="text-dsa-parchment font-mono">{tpl.price} Silber</span></div>}
                  <div className="flex justify-between"><span className="text-dsa-parchment-dark">Status</span><span className={item.equipped ? 'text-dsa-gold font-bold' : 'text-dsa-parchment-dark'}>{item.equipped ? 'Angelegt' : 'Nicht angelegt'}</span></div>
                </div>
                <div className="bg-dsa-bg-light/30 border border-dsa-bg-medium rounded-sm p-2.5 text-[11px] text-dsa-parchment-dark leading-relaxed space-y-1">
                  <p><strong className="text-blue-400">PA-Bonus</strong> wird auf deine Parade addiert wenn du den Schild trägst. Voraussetzung: SF Schildkampf.</p>
                  {atMod !== 0 && <p><strong className="text-red-400">AT-Malus</strong> ({atMod}) — der Schild behindert deinen Angriff leicht.</p>}
                  <p>Ein Schild kann <strong className="text-dsa-parchment">nicht</strong> zusammen mit einer zweihändigen Waffe genutzt werden.</p>
                </div>
              </div>
            </DetailPopup>
          )
        })()}

      </div>
    </div>
  )
}

export default React.memo(ArmoryTab)
