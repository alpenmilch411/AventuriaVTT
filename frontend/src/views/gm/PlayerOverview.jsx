import React, { useState } from 'react'
import { User, Wifi, WifiOff, MessageSquare, Dice5, Eye } from 'lucide-react'
import useSessionStore from '../../stores/sessionStore'
import useCharacterStore from '../../stores/characterStore'
import VitalsBar from '../../components/common/VitalsBar'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import DiceInput from '../../components/common/DiceInput'
import clsx from 'clsx'

function PlayerOverview({ sendMessage, gmControls }) {
  const players = useSessionStore((s) => s.players)
  const allCharacters = useCharacterStore((s) => s.allCharacters)

  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [showProbeDialog, setShowProbeDialog] = useState(null)
  const [showWhisperDialog, setShowWhisperDialog] = useState(null)
  const [whisperText, setWhisperText] = useState('')
  const [probeType, setProbeType] = useState('talent')
  const [probeName, setProbeName] = useState('')

  const handleSendProbe = (playerId) => {
    gmControls.sendProbe(playerId, {
      type: probeType,
      name: probeName,
    })
    setShowProbeDialog(null)
    setProbeName('')
  }

  const handleSendWhisper = (playerId) => {
    if (!whisperText.trim()) return
    gmControls.whisper(playerId, whisperText)
    setShowWhisperDialog(null)
    setWhisperText('')
  }

  // Merge player connection data with character data
  const playerCards = players.map((player) => {
    const char = allCharacters.find((c) => c.id === player.characterId) || player.character || {}
    return { ...player, character: char }
  })

  return (
    <div className="space-y-3">
      <h2 className="section-title text-sm">Spieler ({players.length})</h2>

      <div className="space-y-2">
        {playerCards.map((player) => {
          const char = player.character || {}
          return (
            <div
              key={player.id}
              className="bg-dsa-bg-card border border-dsa-bg-medium rounded-sm p-3 space-y-2"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={clsx(
                    'w-2 h-2 rounded-full',
                    player.connected ? 'bg-dsa-success' : 'bg-dsa-danger'
                  )} />
                  <div>
                    <div className="text-sm font-semibold text-dsa-parchment">
                      {char.name || player.username || 'Unbekannt'}
                    </div>
                    <div className="text-[10px] text-dsa-parchment-dark">
                      {char.species || ''} {char.profession || ''}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setShowProbeDialog(player.id)}
                    className="p-1.5 text-dsa-parchment-dark hover:text-dsa-gold hover:bg-dsa-bg-medium rounded transition-colors"
                    title="Probe anfordern"
                  >
                    <Dice5 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setShowWhisperDialog(player.id)}
                    className="p-1.5 text-dsa-parchment-dark hover:text-dsa-gold hover:bg-dsa-bg-medium rounded transition-colors"
                    title="Fluestern"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setSelectedPlayer(player)}
                    className="p-1.5 text-dsa-parchment-dark hover:text-dsa-gold hover:bg-dsa-bg-medium rounded transition-colors"
                    title="Details anzeigen"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Vitals */}
              <VitalsBar
                lep={(char.current_vitals || {}).lep ?? char.derived_values?.LeP_max ?? 30}
                lepMax={char.derived_values?.LeP_max ?? 30}
                asp={(char.current_vitals || {}).asp ?? char.derived_values?.AsP_max ?? 0}
                aspMax={char.derived_values?.AsP_max ?? 0}
                kap={(char.current_vitals || {}).kap ?? char.derived_values?.KaP_max ?? 0}
                kapMax={char.derived_values?.KaP_max ?? 0}
                schip={(char.current_vitals || {}).schip ?? char.derived_values?.Schip ?? 3}
                schipMax={char.derived_values?.Schip ?? 3}
                conditions={char.conditions || []}
                compact
              />
            </div>
          )
        })}

        {players.length === 0 && (
          <div className="text-center py-8">
            <User className="w-8 h-8 text-dsa-parchment-dark/30 mx-auto mb-2" />
            <p className="text-sm text-dsa-parchment-dark">Keine Spieler verbunden</p>
          </div>
        )}
      </div>

      {/* Probe Dialog */}
      <Modal
        isOpen={!!showProbeDialog}
        onClose={() => setShowProbeDialog(null)}
        title="Probe anfordern"
        footer={
          <>
            <button onClick={() => setShowProbeDialog(null)} className="btn-ghost">Abbrechen</button>
            <button onClick={() => handleSendProbe(showProbeDialog)} className="btn-primary">Senden</button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label">Art</label>
            <select
              value={probeType}
              onChange={(e) => setProbeType(e.target.value)}
              className="input-field"
            >
              <option value="talent">Talentprobe</option>
              <option value="attribute">Eigenschaftsprobe</option>
              <option value="attack">Attacke</option>
              <option value="defense">Parade/Ausweichen</option>
              <option value="spell">Zauberprobe</option>
              <option value="liturgy">Liturgieprobe</option>
            </select>
          </div>
          <div>
            <label className="label">Bezeichnung</label>
            <input
              type="text"
              value={probeName}
              onChange={(e) => setProbeName(e.target.value)}
              className="input-field"
              placeholder="z.B. Sinnesschaerfe, Klettern..."
            />
          </div>
        </div>
      </Modal>

      {/* Whisper Dialog */}
      <Modal
        isOpen={!!showWhisperDialog}
        onClose={() => setShowWhisperDialog(null)}
        title="Fluestern"
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
            placeholder="Geheime Nachricht..."
            autoFocus
          />
        </div>
      </Modal>

      {/* Player Detail Modal */}
      <Modal
        isOpen={!!selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        title={selectedPlayer?.character?.name || selectedPlayer?.username}
        size="lg"
      >
        {selectedPlayer && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-dsa-parchment-dark">Spezies:</span>{' '}
                <span className="text-dsa-parchment">{selectedPlayer.character?.species || '-'}</span>
              </div>
              <div>
                <span className="text-dsa-parchment-dark">Profession:</span>{' '}
                <span className="text-dsa-parchment">{selectedPlayer.character?.profession || '-'}</span>
              </div>
            </div>
            <VitalsBar
              lep={(selectedPlayer.character?.current_vitals || {}).lep ?? selectedPlayer.character?.derived_values?.LeP_max ?? 30}
              lepMax={selectedPlayer.character?.derived_values?.LeP_max ?? 30}
              asp={(selectedPlayer.character?.current_vitals || {}).asp ?? selectedPlayer.character?.derived_values?.AsP_max ?? 0}
              aspMax={selectedPlayer.character?.derived_values?.AsP_max ?? 0}
              kap={(selectedPlayer.character?.current_vitals || {}).kap ?? selectedPlayer.character?.derived_values?.KaP_max ?? 0}
              kapMax={selectedPlayer.character?.derived_values?.KaP_max ?? 0}
              schip={(selectedPlayer.character?.current_vitals || {}).schip ?? selectedPlayer.character?.derived_values?.Schip ?? 3}
              schipMax={selectedPlayer.character?.derived_values?.Schip ?? 3}
              conditions={selectedPlayer.character?.conditions || []}
            />
          </div>
        )}
      </Modal>
    </div>
  )
}

export default React.memo(PlayerOverview)
