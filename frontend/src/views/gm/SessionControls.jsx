import React, { useState } from 'react'
import { X, Play, Pause, Square, Gift, Clock, Cloud, Sun, CloudRain, CloudSnow, Wind } from 'lucide-react'
import useSessionStore from '../../stores/sessionStore'
import useCampaignStore from '../../stores/campaignStore'
import Modal from '../../components/common/Modal'
import clsx from 'clsx'

const WEATHER_OPTIONS = [
  { id: 'klar', label: 'Klar', icon: Sun },
  { id: 'bewoelkt', label: 'Bewoelkt', icon: Cloud },
  { id: 'regen', label: 'Regen', icon: CloudRain },
  { id: 'schnee', label: 'Schnee', icon: CloudSnow },
  { id: 'sturm', label: 'Sturm', icon: Wind },
]

function SessionControls({ onClose, sendMessage, gmControls }) {
  const players = useSessionStore((s) => s.players)
  const worldClock = useCampaignStore((s) => s.worldClock)
  const weather = useCampaignStore((s) => s.weather)
  const setWeather = useCampaignStore((s) => s.setWeather)

  const [showAPDialog, setShowAPDialog] = useState(false)
  const [apAmounts, setApAmounts] = useState({})
  const [sessionActive, setSessionActive] = useState(true)
  const [showEndConfirm, setShowEndConfirm] = useState(false)

  const handleAwardAP = () => {
    Object.entries(apAmounts).forEach(([playerId, amount]) => {
      if (amount > 0) {
        gmControls.awardAP(playerId, parseInt(amount))
      }
    })
    setShowAPDialog(false)
    setApAmounts({})
  }

  const handleWeatherChange = (newWeather) => {
    setWeather(newWeather)
    gmControls.setWeather(newWeather)
  }

  return (
    <div className="h-full flex flex-col bg-dsa-bg-light border-l border-dsa-bg-medium shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dsa-bg-medium">
        <h2 className="text-sm font-display font-semibold text-dsa-gold">Session-Steuerung</h2>
        <button onClick={onClose} className="text-dsa-parchment-dark hover:text-dsa-parchment">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Session Controls */}
        <div>
          <h3 className="text-xs font-semibold text-dsa-parchment-dark uppercase tracking-wider mb-3">Session</h3>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setSessionActive(true)
                sendMessage?.({ category: 'session', type: 'session_start', payload: {} })
              }}
              className={clsx(
                'flex-1 py-2 rounded-sm flex items-center justify-center gap-2 text-sm font-medium transition-colors',
                sessionActive ? 'bg-dsa-success/20 text-green-400' : 'bg-dsa-bg-card text-dsa-parchment-dark hover:bg-dsa-bg-medium'
              )}
            >
              <Play className="w-4 h-4" />
              Start
            </button>
            <button
              onClick={() => {
                setSessionActive(false)
                sendMessage?.({ category: 'session', type: 'session_pause', payload: {} })
              }}
              className={clsx(
                'flex-1 py-2 rounded-sm flex items-center justify-center gap-2 text-sm font-medium transition-colors',
                !sessionActive ? 'bg-dsa-warning/20 text-yellow-400' : 'bg-dsa-bg-card text-dsa-parchment-dark hover:bg-dsa-bg-medium'
              )}
            >
              <Pause className="w-4 h-4" />
              Pause
            </button>
            <button
              onClick={() => setShowEndConfirm(true)}
              className="flex-1 py-2 rounded-sm flex items-center justify-center gap-2 text-sm font-medium bg-dsa-bg-card text-dsa-parchment-dark hover:bg-dsa-danger/20 hover:text-red-400 transition-colors"
            >
              <Square className="w-4 h-4" />
              Ende
            </button>
          </div>
        </div>

        {/* AP Award */}
        <div>
          <h3 className="text-xs font-semibold text-dsa-parchment-dark uppercase tracking-wider mb-3">Abenteuerpunkte vergeben</h3>
          <button
            onClick={() => setShowAPDialog(true)}
            className="btn-secondary w-full flex items-center justify-center gap-2"
          >
            <Gift className="w-4 h-4" />
            AP vergeben
          </button>
        </div>

        {/* World Clock */}
        <div>
          <h3 className="text-xs font-semibold text-dsa-parchment-dark uppercase tracking-wider mb-3">Weltuhr</h3>
          <div className="bg-dsa-bg-card rounded-sm p-4 text-center">
            <Clock className="w-6 h-6 text-dsa-gold mx-auto mb-2" />
            <div className="text-lg font-display text-dsa-parchment">
              {worldClock?.date || '1. Praios 1040 BF'}
            </div>
            <div className="text-sm font-mono text-dsa-gold">
              {worldClock?.time || '12:00'}
            </div>
            <div className="text-xs text-dsa-parchment-dark mt-1 capitalize">
              {worldClock?.dayNight === 'night' ? 'Nacht' : 'Tag'}
            </div>
          </div>
        </div>

        {/* Weather */}
        <div>
          <h3 className="text-xs font-semibold text-dsa-parchment-dark uppercase tracking-wider mb-3">Wetter</h3>
          <div className="grid grid-cols-3 gap-2">
            {WEATHER_OPTIONS.map((w) => (
              <button
                key={w.id}
                onClick={() => handleWeatherChange(w.id)}
                className={clsx(
                  'p-2 rounded-sm border text-center transition-all',
                  weather === w.id
                    ? 'bg-dsa-gold/10 border-dsa-gold/40 text-dsa-gold'
                    : 'bg-dsa-bg-card border-dsa-bg-medium text-dsa-parchment-dark hover:border-dsa-gold/20'
                )}
              >
                <w.icon className="w-5 h-5 mx-auto mb-1" />
                <div className="text-[10px]">{w.label}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* AP Dialog */}
      <Modal
        isOpen={showAPDialog}
        onClose={() => setShowAPDialog(false)}
        title="Abenteuerpunkte vergeben"
        footer={
          <>
            <button onClick={() => setShowAPDialog(false)} className="btn-ghost">Abbrechen</button>
            <button onClick={handleAwardAP} className="btn-primary">Vergeben</button>
          </>
        }
      >
        <div className="space-y-3">
          {players.map((player) => (
            <div key={player.id} className="flex items-center justify-between gap-3">
              <span className="text-sm text-dsa-parchment">
                {player.character?.name || player.username || 'Spieler'}
              </span>
              <input
                type="number"
                min="0"
                value={apAmounts[player.id] || ''}
                onChange={(e) => setApAmounts({ ...apAmounts, [player.id]: e.target.value })}
                className="input-field w-20 text-center"
                placeholder="AP"
              />
            </div>
          ))}
          {players.length === 0 && (
            <p className="text-sm text-dsa-parchment-dark text-center">Keine Spieler verbunden</p>
          )}
        </div>
      </Modal>

      {/* End Session Confirmation */}
      <Modal
        isOpen={showEndConfirm}
        onClose={() => setShowEndConfirm(false)}
        title="Session beenden"
        size="sm"
        footer={
          <>
            <button onClick={() => setShowEndConfirm(false)} className="btn-ghost">Abbrechen</button>
            <button
              onClick={() => {
                sendMessage?.({ category: 'session', type: 'session_end', payload: {} })
                setSessionActive(false)
                setShowEndConfirm(false)
              }}
              className="px-4 py-2 bg-dsa-danger text-white rounded-sm text-sm font-medium hover:bg-red-600 transition-colors"
            >
              <Square className="w-4 h-4 inline mr-1" /> Session beenden
            </button>
          </>
        }
      >
        <div className="text-center py-2">
          <p className="text-sm text-dsa-parchment">Bist du sicher, dass du die Session beenden moechtest?</p>
          <p className="text-xs text-dsa-parchment-dark mt-2">Alle Spieler werden benachrichtigt und die Verbindung wird getrennt.</p>
        </div>
      </Modal>
    </div>
  )
}

export default React.memo(SessionControls)
