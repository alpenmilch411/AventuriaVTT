import React, { useState } from 'react'
import { User, MessageSquare, Dice5, Eye, Heart, Sparkles, Star, Shield, Swords, Footprints } from 'lucide-react'
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
  const [showWhisperDialog, setShowWhisperDialog] = useState(null)
  const [whisperText, setWhisperText] = useState('')

  const handleSendWhisper = (playerId) => {
    if (!whisperText.trim()) return
    gmControls.whisper(playerId, whisperText)
    setShowWhisperDialog(null)
    setWhisperText('')
  }

  // Only show connected players — merge with character data
  const connectedPlayers = players
    .filter(p => p.connected)
    .map(player => {
      const char = allCharacters.find(c => c.id === player.characterId) || player.character || {}
      const vitals = getVitalsFrom({ ...player, ...char, current_vitals: player.current_vitals || char.current_vitals })
      const maxVitals = getMaxVitals(char)
      const conditions = getConditions({ ...player, ...char })
      return { ...player, character: char, vitals, maxVitals, conditions }
    })

  return (
    <div className="space-y-3">
      <h2 className="section-title text-sm flex items-center gap-2">
        <User className="w-4 h-4" />
        Spieler ({connectedPlayers.length} verbunden)
      </h2>

      <div className="space-y-2">
        {connectedPlayers.map(player => {
          const char = player.character || {}
          const v = player.vitals
          const mv = player.maxVitals
          const lepPct = mv.lepMax > 0 ? v.lep / mv.lepMax : 1
          const isHurt = lepPct < 0.75
          const isCritical = lepPct < 0.25

          return (
            <div
              key={player.id}
              onClick={() => setSelectedPlayer(player)}
              className="bg-dsa-bg-card border border-dsa-bg-medium rounded-sm p-3 space-y-2 cursor-pointer hover:border-dsa-gold/20 transition-colors"
            >
              {/* Header: Name + Species/Profession + Actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-dsa-success animate-pulse" />
                  <div>
                    <div className="text-sm font-semibold text-dsa-parchment">
                      {char.name || player.username || 'Unbekannt'}
                    </div>
                    <div className="text-[10px] text-dsa-parchment-dark">
                      {[char.species, char.profession].filter(Boolean).join(' · ') || player.username || ''}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setShowWhisperDialog(player.id)}
                    className="p-1.5 text-dsa-parchment-dark hover:text-dsa-gold hover:bg-dsa-bg-medium rounded transition-colors"
                    title="Flüstern"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Vitals bars */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Heart className={clsx('w-3 h-3 flex-shrink-0', isCritical ? 'text-red-500' : isHurt ? 'text-yellow-400' : 'text-dsa-blood')} />
                  <ProgressBar current={v.lep} max={mv.lepMax} preset="health" size="sm" className="flex-1" />
                  <span className={clsx('text-[9px] font-mono w-12 text-right', isCritical ? 'text-red-400' : 'text-dsa-parchment-dark')}>
                    {v.lep}/{mv.lepMax}
                  </span>
                </div>
                {mv.aspMax > 0 && (
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3 h-3 flex-shrink-0 text-dsa-mana" />
                    <ProgressBar current={v.asp} max={mv.aspMax} preset="mana" size="sm" className="flex-1" />
                    <span className="text-[9px] font-mono text-dsa-parchment-dark w-12 text-right">{v.asp}/{mv.aspMax}</span>
                  </div>
                )}
                {mv.kapMax > 0 && (
                  <div className="flex items-center gap-2">
                    <Star className="w-3 h-3 flex-shrink-0 text-dsa-karma" />
                    <ProgressBar current={v.kap} max={mv.kapMax} preset="karma" size="sm" className="flex-1" />
                    <span className="text-[9px] font-mono text-dsa-parchment-dark w-12 text-right">{v.kap}/{mv.kapMax}</span>
                  </div>
                )}
              </div>

              {/* Conditions */}
              {player.conditions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {player.conditions.map((cond, i) => (
                    <Badge key={i} variant="warning" size="sm">
                      {typeof cond === 'string' ? cond : `${cond.name} ${cond.level > 1 ? cond.level : ''}`}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {connectedPlayers.length === 0 && (
          <div className="text-center py-8">
            <User className="w-8 h-8 text-dsa-parchment-dark/30 mx-auto mb-2" />
            <p className="text-sm text-dsa-parchment-dark">Keine Spieler verbunden</p>
            <p className="text-[10px] text-dsa-parchment-dark/60 mt-1">Spieler verbinden sich über den Session-Code</p>
          </div>
        )}
      </div>

      {/* Whisper Dialog */}
      <Modal
        isOpen={!!showWhisperDialog}
        onClose={() => setShowWhisperDialog(null)}
        title="Flüstern"
        footer={
          <>
            <button onClick={() => setShowWhisperDialog(null)} className="btn-ghost">Abbrechen</button>
            <button onClick={() => handleSendWhisper(showWhisperDialog)} className="btn-primary">Senden</button>
          </>
        }
      >
        <div>
          <label className="label">Nachricht</label>
          <textarea
            value={whisperText}
            onChange={(e) => setWhisperText(e.target.value)}
            className="input-field h-24 resize-none"
            placeholder="Geheime Nachricht an diesen Spieler..."
            autoFocus
          />
        </div>
      </Modal>

      {/* Player Detail Modal */}
      <Modal
        isOpen={!!selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        title={selectedPlayer?.character?.name || selectedPlayer?.username || 'Spieler'}
        size="lg"
      >
        {selectedPlayer && <PlayerDetailView player={selectedPlayer} />}
      </Modal>
    </div>
  )
}

// ── Full detail view when GM clicks on a player ──

function PlayerDetailView({ player }) {
  const char = player.character || {}
  const v = player.vitals
  const mv = player.maxVitals
  const attrs = char.attributes || {}
  const dv = char.derived_values || {}
  const cv = char.combat_values || {}
  const conditions = player.conditions || []

  const ATTR_LABELS = { MU: 'Mut', KL: 'Klugheit', IN: 'Intuition', CH: 'Charisma', FF: 'Fingerfertigkeit', GE: 'Gewandtheit', KO: 'Konstitution', KK: 'Körperkraft' }
  const ATTR_ORDER = ['MU', 'KL', 'IN', 'CH', 'FF', 'GE', 'KO', 'KK']

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div><span className="text-dsa-parchment-dark">Spezies:</span> <span className="text-dsa-parchment">{char.species || '-'}</span></div>
        <div><span className="text-dsa-parchment-dark">Profession:</span> <span className="text-dsa-parchment">{char.profession || '-'}</span></div>
        <div><span className="text-dsa-parchment-dark">Kultur:</span> <span className="text-dsa-parchment">{char.culture || '-'}</span></div>
        <div><span className="text-dsa-parchment-dark">AP:</span> <span className="text-dsa-parchment">{char.total_ap ?? '-'} ({char.available_ap ?? 0} frei)</span></div>
      </div>

      {/* Vitals */}
      <div className="space-y-1.5">
        <h3 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider">Energien</h3>
        <div className="flex items-center gap-2">
          <Heart className="w-3.5 h-3.5 text-dsa-blood flex-shrink-0" />
          <ProgressBar current={v.lep} max={mv.lepMax} preset="health" size="sm" className="flex-1" />
          <span className="text-xs font-mono text-dsa-parchment w-14 text-right">{v.lep}/{mv.lepMax}</span>
        </div>
        {mv.aspMax > 0 && (
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-dsa-mana flex-shrink-0" />
            <ProgressBar current={v.asp} max={mv.aspMax} preset="mana" size="sm" className="flex-1" />
            <span className="text-xs font-mono text-dsa-parchment w-14 text-right">{v.asp}/{mv.aspMax}</span>
          </div>
        )}
        {mv.kapMax > 0 && (
          <div className="flex items-center gap-2">
            <Star className="w-3.5 h-3.5 text-dsa-karma flex-shrink-0" />
            <ProgressBar current={v.kap} max={mv.kapMax} preset="karma" size="sm" className="flex-1" />
            <span className="text-xs font-mono text-dsa-parchment w-14 text-right">{v.kap}/{mv.kapMax}</span>
          </div>
        )}
        <div className="text-[10px] text-dsa-parchment-dark">
          SchiP: {v.schip}/{mv.schipMax}
        </div>
      </div>

      {/* Attributes */}
      <div>
        <h3 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider mb-1.5">Eigenschaften</h3>
        <div className="grid grid-cols-4 gap-1.5">
          {ATTR_ORDER.map(key => (
            <div key={key} className="bg-dsa-bg rounded px-2 py-1 text-center">
              <div className="text-[9px] text-dsa-parchment-dark">{ATTR_LABELS[key]}</div>
              <div className="text-sm font-bold text-dsa-parchment">{attrs[key] ?? '-'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Combat values */}
      <div>
        <h3 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider mb-1.5">Kampfwerte</h3>
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { key: 'AT', label: 'Attacke', icon: Swords },
            { key: 'PA', label: 'Parade', icon: Shield },
            { key: 'AW', label: 'Ausweichen', icon: Footprints },
            { key: 'FK', label: 'Fernkampf', icon: Swords },
            { key: 'INI', label: 'Initiative', val: dv.INI_basis },
            { key: 'GS', label: 'Geschw.', val: dv.GS },
            { key: 'RS', label: 'Rüstung' },
            { key: 'BE', label: 'Behind.' },
          ].map(({ key, label, val }) => (
            <div key={key} className="bg-dsa-bg rounded px-2 py-1 text-center">
              <div className="text-[9px] text-dsa-parchment-dark">{label}</div>
              <div className="text-sm font-bold text-dsa-parchment">{val ?? cv[key] ?? dv[key] ?? '-'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Conditions */}
      {conditions.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider mb-1.5">Zustände</h3>
          <div className="flex flex-wrap gap-1.5">
            {conditions.map((cond, i) => {
              const name = typeof cond === 'string' ? cond : cond.name
              const level = typeof cond === 'string' ? 1 : (cond.level || 1)
              return (
                <Badge key={i} variant="warning">
                  {name} {level > 1 ? `Stufe ${level}` : ''}
                </Badge>
              )
            })}
          </div>
        </div>
      )}

      {/* Special abilities (brief) */}
      {char.special_abilities && char.special_abilities.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider mb-1.5">Sonderfertigkeiten</h3>
          <div className="flex flex-wrap gap-1">
            {char.special_abilities.slice(0, 12).map((sf, i) => (
              <Badge key={i} variant="default" size="sm">
                {typeof sf === 'string' ? sf : sf.name}
              </Badge>
            ))}
            {char.special_abilities.length > 12 && (
              <span className="text-[9px] text-dsa-parchment-dark">+{char.special_abilities.length - 12} weitere</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default React.memo(PlayerOverview)
