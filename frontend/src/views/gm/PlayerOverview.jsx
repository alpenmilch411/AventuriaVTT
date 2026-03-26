import React, { useState } from 'react'
import { User, MessageSquare, Heart, Sparkles, Star, Shield, Swords, Footprints, Plus, Minus, Send } from 'lucide-react'
import useSessionStore from '../../stores/sessionStore'
import useCharacterStore from '../../stores/characterStore'
import { getConditions, getVitalsFrom, getMaxVitals } from '../../utils/safeData'
import ProgressBar from '../../components/common/ProgressBar'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import clsx from 'clsx'

function PlayerOverview({ sendMessage, gmControls }) {
  const players = useSessionStore((s) => s.players)
  const allCharacters = useCharacterStore((s) => s.allCharacters)

  const [selectedPlayer, setSelectedPlayer] = useState(null)

  // All players who have joined — merge with character data, connected first
  const allPlayers = players
    .map(player => {
      const char = allCharacters.find(c => c.id === player.characterId) || player.character || {}
      const vitals = getVitalsFrom({ ...player, ...char, current_vitals: player.current_vitals || char.current_vitals })
      const maxVitals = getMaxVitals(char)
      const conditions = getConditions({ ...player, ...char })
      return { ...player, character: char, vitals, maxVitals, conditions }
    })
    .sort((a, b) => (b.connected ? 1 : 0) - (a.connected ? 1 : 0))

  const onlineCount = allPlayers.filter(p => p.connected).length

  return (
    <div className="space-y-3">
      <h2 className="section-title text-sm flex items-center gap-2">
        <User className="w-4 h-4" />
        Spieler ({onlineCount}/{allPlayers.length})
      </h2>

      <div className="space-y-1.5">
        {allPlayers.map(player => (
          <PlayerCard
            key={player.id}
            player={player}
            onClick={() => setSelectedPlayer(player)}
          />
        ))}

        {allPlayers.length === 0 && (
          <div className="text-center py-8">
            <User className="w-8 h-8 text-dsa-parchment-dark/30 mx-auto mb-2" />
            <p className="text-sm text-dsa-parchment-dark">Noch keine Spieler beigetreten</p>
            <p className="text-[10px] text-dsa-parchment-dark/60 mt-1">Spieler verbinden sich über den Session-Code</p>
          </div>
        )}
      </div>

      {/* Player Detail Panel */}
      <Modal
        isOpen={!!selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        title={selectedPlayer?.character?.name || selectedPlayer?.username || 'Spieler'}
        size="lg"
      >
        {selectedPlayer && (
          <PlayerDetailView
            player={selectedPlayer}
            sendMessage={sendMessage}
            gmControls={gmControls}
            onClose={() => setSelectedPlayer(null)}
          />
        )}
      </Modal>
    </div>
  )
}

// ── Compact player card — what the GM sees at a glance ──

function PlayerCard({ player, onClick }) {
  const char = player.character || {}
  const v = player.vitals
  const mv = player.maxVitals
  const lepPct = mv.lepMax > 0 ? v.lep / mv.lepMax : 1
  const isCritical = lepPct < 0.25
  const isOnline = !!player.connected

  return (
    <div
      onClick={onClick}
      className={clsx(
        'border rounded-sm px-3 py-2 cursor-pointer transition-colors',
        isOnline
          ? 'bg-dsa-bg-card border-dsa-bg-medium hover:border-dsa-gold/30'
          : 'bg-dsa-bg-card/40 border-dsa-bg-medium/40 opacity-50'
      )}
    >
      {/* Row 1: Status dot + Name + Username */}
      <div className="flex items-center gap-2 mb-1.5">
        <div className={clsx(
          'w-2 h-2 rounded-full flex-shrink-0',
          isOnline ? 'bg-dsa-success animate-pulse' : 'bg-dsa-parchment-dark/30'
        )} />
        <span className="text-sm font-semibold text-dsa-parchment truncate">
          {char.name || 'Unbekannt'}
        </span>
        <span className="text-[9px] text-dsa-parchment-dark truncate ml-auto flex-shrink-0">
          {player.username || ''}
          {!isOnline && ' (Offline)'}
        </span>
      </div>

      {/* Row 2: Vitals bars — LeP always, AsP/KaP only for casters */}
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <Heart className={clsx('w-3 h-3 flex-shrink-0', isCritical ? 'text-red-500' : 'text-dsa-blood')} />
          <div className="flex-1 h-2 bg-dsa-bg rounded-full overflow-hidden">
            <div className={clsx('h-full rounded-full transition-all duration-500', lepPct <= 0.25 ? 'bg-red-500' : lepPct <= 0.5 ? 'bg-yellow-500' : 'bg-green-600')} style={{ width: `${Math.max(0, lepPct * 100)}%` }} />
          </div>
          <span className={clsx('text-[9px] font-mono w-10 text-right flex-shrink-0', isCritical ? 'text-red-400 font-bold' : 'text-dsa-parchment-dark')}>{v.lep}/{mv.lepMax}</span>
        </div>
        {mv.aspMax > 0 && (
          <div className="flex items-center gap-2">
            <Sparkles className="w-3 h-3 flex-shrink-0 text-dsa-mana" />
            <div className="flex-1 h-1.5 bg-dsa-bg rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${mv.aspMax > 0 ? Math.max(0, v.asp / mv.aspMax * 100) : 0}%` }} />
            </div>
            <span className="text-[9px] font-mono text-dsa-parchment-dark w-10 text-right flex-shrink-0">{v.asp}/{mv.aspMax}</span>
          </div>
        )}
        {mv.kapMax > 0 && (
          <div className="flex items-center gap-2">
            <Star className="w-3 h-3 flex-shrink-0 text-dsa-karma" />
            <div className="flex-1 h-1.5 bg-dsa-bg rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-purple-500 transition-all duration-500" style={{ width: `${mv.kapMax > 0 ? Math.max(0, v.kap / mv.kapMax * 100) : 0}%` }} />
            </div>
            <span className="text-[9px] font-mono text-dsa-parchment-dark w-10 text-right flex-shrink-0">{v.kap}/{mv.kapMax}</span>
          </div>
        )}
      </div>

      {/* Row 3: Conditions (only if any) */}
      {player.conditions.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-1">
          {player.conditions.map((cond, i) => {
            const name = typeof cond === 'string' ? cond : cond.name
            const level = typeof cond === 'string' ? 1 : (cond.level || 1)
            return (
              <span key={i} className="text-[8px] px-1 py-0.5 rounded bg-yellow-900/40 text-yellow-400 border border-yellow-800/30">
                {name}{level > 1 ? ` ${level}` : ''}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Full detail view — GM's reference + quick actions ──

function PlayerDetailView({ player, sendMessage, gmControls, onClose }) {
  const char = player.character || {}
  const v = player.vitals
  const mv = player.maxVitals
  const attrs = char.attributes || {}
  const dv = char.derived_values || {}
  const cv = char.combat_values || {}
  const conditions = player.conditions || []
  const isOnline = !!player.connected

  // Quick action state
  const [whisperText, setWhisperText] = useState('')
  const [lepDelta, setLepDelta] = useState('')

  const handleWhisper = () => {
    if (!whisperText.trim()) return
    gmControls?.whisper(player.id, whisperText)
    setWhisperText('')
  }

  const handleLepChange = (delta) => {
    const val = parseInt(delta)
    if (isNaN(val) || val === 0) return
    sendMessage?.({
      type: 'vitals_update',
      payload: { character_id: player.characterId, vitals: { lep_delta: val } }
    })
    setLepDelta('')
  }

  // Extract equipped weapons from inventory
  const inventory = char.basis_inventory || char.campaign_inventory || {}
  const items = Array.isArray(inventory) ? inventory : (inventory.items || [])
  const equippedWeapons = items.filter(i => i.equipped && (i.category === 'weapon' || i.category === 'waffe' || i.at_mod !== undefined))
  const equippedArmor = items.filter(i => i.equipped && (i.category === 'armor' || i.category === 'rüstung' || i.rs !== undefined))

  const ATTR_ORDER = ['MU', 'KL', 'IN', 'CH', 'FF', 'GE', 'KO', 'KK']

  return (
    <div className="space-y-4">
      {/* Identity + Status */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-dsa-parchment-dark">
          {[char.species, char.culture, char.profession].filter(Boolean).join(' · ')}
        </div>
        <div className="flex items-center gap-1.5">
          <div className={clsx('w-2 h-2 rounded-full', isOnline ? 'bg-dsa-success' : 'bg-dsa-parchment-dark/30')} />
          <span className="text-[10px] text-dsa-parchment-dark">{isOnline ? 'Online' : 'Offline'}</span>
        </div>
      </div>

      {/* ── Vitals ── */}
      <div className="bg-dsa-bg rounded p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-dsa-blood flex-shrink-0" />
          <ProgressBar current={v.lep} max={mv.lepMax} preset="health" size="sm" showValues={false} className="flex-1" />
          <span className="text-xs font-mono text-dsa-parchment w-14 text-right">{v.lep}/{mv.lepMax}</span>
        </div>
        {mv.aspMax > 0 && (
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-dsa-mana flex-shrink-0" />
            <ProgressBar current={v.asp} max={mv.aspMax} preset="mana" size="sm" showValues={false} className="flex-1" />
            <span className="text-xs font-mono text-dsa-parchment w-14 text-right">{v.asp}/{mv.aspMax}</span>
          </div>
        )}
        {mv.kapMax > 0 && (
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-dsa-karma flex-shrink-0" />
            <ProgressBar current={v.kap} max={mv.kapMax} preset="karma" size="sm" showValues={false} className="flex-1" />
            <span className="text-xs font-mono text-dsa-parchment w-14 text-right">{v.kap}/{mv.kapMax}</span>
          </div>
        )}
        <div className="text-[10px] text-dsa-parchment-dark">
          Schicksalspunkte: {v.schip}/{mv.schipMax} · AP: {char.total_ap ?? '-'} ({char.available_ap ?? 0} frei)
        </div>
      </div>

      {/* ── Quick HP action ── */}
      <div className="flex items-center gap-2">
        <button onClick={() => handleLepChange(-1)} className="p-1.5 bg-red-900/30 text-red-400 rounded hover:bg-red-900/50 transition" title="-1 LeP">
          <Minus className="w-3.5 h-3.5" />
        </button>
        <input
          type="number"
          value={lepDelta}
          onChange={e => setLepDelta(e.target.value)}
          placeholder="LeP +/-"
          className="flex-1 text-center text-sm bg-dsa-bg border border-dsa-bg-medium rounded px-2 py-1.5 text-dsa-parchment placeholder:text-dsa-parchment-dark/40"
          onKeyDown={e => e.key === 'Enter' && handleLepChange(lepDelta)}
        />
        <button onClick={() => handleLepChange(1)} className="p-1.5 bg-green-900/30 text-green-400 rounded hover:bg-green-900/50 transition" title="+1 LeP">
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => handleLepChange(lepDelta)} className="px-3 py-1.5 bg-dsa-gold/10 text-dsa-gold text-xs rounded hover:bg-dsa-gold/20 transition">
          Anwenden
        </button>
      </div>

      {/* ── Attributes (2 rows of 4) ── */}
      <div>
        <h3 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider mb-1">Eigenschaften</h3>
        <div className="grid grid-cols-8 gap-1">
          {ATTR_ORDER.map(key => (
            <div key={key} className="text-center">
              <div className="text-[8px] text-dsa-parchment-dark">{key}</div>
              <div className="text-sm font-bold text-dsa-parchment">{attrs[key] ?? '-'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Combat values (single row) ── */}
      <div>
        <h3 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider mb-1">Kampfwerte</h3>
        <div className="grid grid-cols-8 gap-1">
          {['AT', 'PA', 'AW', 'FK', 'INI', 'GS', 'RS', 'BE'].map(key => (
            <div key={key} className="text-center">
              <div className="text-[8px] text-dsa-parchment-dark">{key}</div>
              <div className="text-sm font-bold text-dsa-parchment">
                {key === 'INI' ? (dv.INI_basis ?? cv.INI ?? '-')
                  : key === 'GS' ? (dv.GS ?? cv.GS ?? '-')
                  : (cv[key] ?? dv[key] ?? '-')}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Equipped gear ── */}
      {(equippedWeapons.length > 0 || equippedArmor.length > 0) && (
        <div>
          <h3 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider mb-1">Ausrüstung</h3>
          <div className="space-y-0.5">
            {equippedWeapons.map((w, i) => (
              <div key={i} className="flex items-center justify-between text-[10px]">
                <span className="text-dsa-parchment flex items-center gap-1">
                  <Swords className="w-3 h-3 text-dsa-gold/60" />{w.name}
                </span>
                <span className="text-dsa-parchment-dark font-mono">
                  {w.damage || '-'} · AT{w.at_mod >= 0 ? '+' : ''}{w.at_mod ?? 0} PA{w.pa_mod >= 0 ? '+' : ''}{w.pa_mod ?? 0}
                </span>
              </div>
            ))}
            {equippedArmor.map((a, i) => (
              <div key={i} className="flex items-center justify-between text-[10px]">
                <span className="text-dsa-parchment flex items-center gap-1">
                  <Shield className="w-3 h-3 text-dsa-gold/60" />{a.name}
                </span>
                <span className="text-dsa-parchment-dark font-mono">RS {a.rs ?? 0} · BE {a.be ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Conditions ── */}
      {conditions.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider mb-1">Zustände</h3>
          <div className="flex flex-wrap gap-1">
            {conditions.map((cond, i) => {
              const name = typeof cond === 'string' ? cond : cond.name
              const level = typeof cond === 'string' ? 1 : (cond.level || 1)
              return <Badge key={i} variant="warning">{name}{level > 1 ? ` ${level}` : ''}</Badge>
            })}
          </div>
        </div>
      )}

      {/* ── Sonderfertigkeiten (combat-relevant only) ── */}
      {char.special_abilities && char.special_abilities.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider mb-1">Sonderfertigkeiten</h3>
          <div className="flex flex-wrap gap-1">
            {char.special_abilities.map((sf, i) => (
              <Badge key={i} variant="default" size="sm">
                {typeof sf === 'string' ? sf : sf.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* ── Whisper ── */}
      <div>
        <h3 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider mb-1">Nachricht flüstern</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={whisperText}
            onChange={e => setWhisperText(e.target.value)}
            placeholder="Geheime Nachricht..."
            className="flex-1 text-sm bg-dsa-bg border border-dsa-bg-medium rounded px-2 py-1.5 text-dsa-parchment placeholder:text-dsa-parchment-dark/40"
            onKeyDown={e => e.key === 'Enter' && handleWhisper()}
          />
          <button onClick={handleWhisper} className="px-3 py-1.5 bg-dsa-gold/10 text-dsa-gold text-xs rounded hover:bg-dsa-gold/20 transition flex items-center gap-1">
            <Send className="w-3 h-3" /> Senden
          </button>
        </div>
      </div>
    </div>
  )
}

export { PlayerDetailView }
export default React.memo(PlayerOverview)
