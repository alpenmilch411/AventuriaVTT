import React, { useState, useEffect } from 'react'
import { X, Play, Pause, Square, Gift, Clock, Cloud, Sun, CloudRain, CloudSnow, Wind, CloudLightning, CloudHail, CloudFog, Moon, Heart, ChevronDown, ChevronUp, Check, Loader2 } from 'lucide-react'
import useSessionStore from '../../stores/sessionStore'
import useCampaignStore from '../../stores/campaignStore'
import Modal from '../../components/common/Modal'
import clsx from 'clsx'

const WEATHER_OPTIONS = [
  { id: 'klar', label: 'Klar', icon: Sun },
  { id: 'bewölkt', label: 'Bewölkt', icon: Cloud },
  { id: 'nebel', label: 'Nebel', icon: CloudFog },
  { id: 'regen', label: 'Regen', icon: CloudRain },
  { id: 'schnee', label: 'Schnee', icon: CloudSnow },
  { id: 'sturm', label: 'Sturm', icon: Wind },
  { id: 'gewitter', label: 'Gewitter', icon: CloudLightning },
  { id: 'hagel', label: 'Hagel', icon: CloudHail },
]

const REST_PRESETS = [
  { id: 'short', label: 'Kurze Rast', hours: 1, desc: '1 Stunde' },
  { id: 'long', label: 'Nachtlager', hours: 8, desc: '8 Stunden' },
  { id: 'custom', label: 'Benutzerdefiniert', hours: 0, desc: '' },
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

  // Listen for rest_end results from WS
  const storeRestResults = useCampaignStore((s) => s.restResults)
  useEffect(() => {
    if (storeRestResults?.results) {
      setRestResults(storeRestResults.results)
      setRestPending(false)
      useCampaignStore.getState().setRestResults(null)
    }
  }, [storeRestResults])

  // Time advance
  const [advanceHours, setAdvanceHours] = useState(1)

  // Rest
  const [showRest, setShowRest] = useState(false)
  const [restPreset, setRestPreset] = useState('long')
  const [restCustomHours, setRestCustomHours] = useState(4)
  const [restCharIds, setRestCharIds] = useState({}) // { charId: true/false }
  const [restPending, setRestPending] = useState(false)
  const [restResults, setRestResults] = useState(null)

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

  const handleTimeAdvance = () => {
    if (advanceHours <= 0) return
    const minutes = Math.round(advanceHours * 60)
    // Parse current time and advance
    const currentTime = worldClock?.time || '12:00'
    const [h, m] = currentTime.split(':').map(Number)
    const totalMin = (h || 0) * 60 + (m || 0) + minutes
    const newH = Math.floor(totalMin / 60) % 24
    const newM = totalMin % 60
    const newTime = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
    sendMessage?.({
      type: 'time_advance',
      payload: { new_time: newTime, advanced_by_minutes: minutes },
    })
  }

  const handleRestOpen = () => {
    // Pre-check all player characters
    const ids = {}
    players.forEach(p => { if (p.characterId) ids[p.characterId] = true })
    setRestCharIds(ids)
    setRestResults(null)
    setRestPending(false)
    setShowRest(true)
  }

  const handleRestStart = () => {
    const charIds = Object.entries(restCharIds).filter(([, v]) => v).map(([k]) => k)
    if (charIds.length === 0) return
    const hours = restPreset === 'custom' ? restCustomHours : REST_PRESETS.find(p => p.id === restPreset)?.hours || 8
    setRestPending(true)
    // Send rest_start, then immediately rest_end (backend resolves on rest_end)
    sendMessage?.({ type: 'rest_start', payload: { character_ids: charIds, duration_hours: hours } })
    // Short delay then send rest_end to trigger resolution
    setTimeout(() => {
      sendMessage?.({ type: 'rest_end', payload: { character_ids: charIds, duration_hours: hours } })
    }, 500)
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

        {/* World Clock + Time Advance */}
        <div>
          <h3 className="text-xs font-semibold text-dsa-parchment-dark uppercase tracking-wider mb-3">Weltuhr</h3>
          <div className="bg-dsa-bg-card rounded-sm p-4 text-center mb-3">
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
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={advanceHours}
              onChange={(e) => setAdvanceHours(parseFloat(e.target.value) || 0)}
              className="input-field w-20 text-center text-sm"
            />
            <span className="text-xs text-dsa-parchment-dark">Stunden</span>
            <button
              onClick={handleTimeAdvance}
              disabled={advanceHours <= 0}
              className="flex-1 px-3 py-2 text-xs bg-dsa-gold/20 border border-dsa-gold/30 text-dsa-gold rounded-sm hover:bg-dsa-gold/30 transition font-bold disabled:opacity-30 flex items-center justify-center gap-1.5"
            >
              <Clock className="w-3.5 h-3.5" /> Vorspulen
            </button>
          </div>
        </div>

        {/* Weather */}
        <div>
          <h3 className="text-xs font-semibold text-dsa-parchment-dark uppercase tracking-wider mb-3">Wetter</h3>
          <div className="grid grid-cols-4 gap-1.5">
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
                <w.icon className="w-4 h-4 mx-auto mb-0.5" />
                <div className="text-[9px]">{w.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Rest / Regeneration */}
        <div>
          <h3 className="text-xs font-semibold text-dsa-parchment-dark uppercase tracking-wider mb-3">Rast & Erholung</h3>
          {!showRest ? (
            <button
              onClick={handleRestOpen}
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              <Moon className="w-4 h-4" /> Rast beginnen
            </button>
          ) : (
            <div className="bg-dsa-bg-card rounded-sm border border-dsa-bg-medium p-3 space-y-3">
              {/* Duration preset */}
              <div className="flex gap-1.5">
                {REST_PRESETS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setRestPreset(p.id)}
                    className={clsx(
                      'flex-1 px-2 py-1.5 text-[10px] rounded-sm border font-bold transition',
                      restPreset === p.id ? 'bg-dsa-gold/10 border-dsa-gold/30 text-dsa-gold' : 'border-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-parchment'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {restPreset === 'custom' && (
                <div className="flex items-center gap-2">
                  <input
                    type="number" min="1" max="24"
                    value={restCustomHours}
                    onChange={e => setRestCustomHours(parseInt(e.target.value) || 1)}
                    className="input-field w-16 text-center text-sm"
                  />
                  <span className="text-xs text-dsa-parchment-dark">Stunden</span>
                </div>
              )}

              {/* Character checkboxes */}
              <div className="space-y-1">
                <div className="text-[10px] text-dsa-parchment-dark uppercase tracking-wider font-bold">Teilnehmer</div>
                {players.filter(p => p.characterId).map(p => (
                  <label key={p.characterId} className="flex items-center gap-2 text-xs text-dsa-parchment cursor-pointer hover:text-dsa-gold transition">
                    <input
                      type="checkbox"
                      checked={!!restCharIds[p.characterId]}
                      onChange={e => setRestCharIds(prev => ({ ...prev, [p.characterId]: e.target.checked }))}
                      className="accent-dsa-gold"
                    />
                    {p.character?.name || p.username}
                  </label>
                ))}
              </div>

              {/* Rest results */}
              {restResults && (
                <div className="space-y-1 border-t border-dsa-bg-medium pt-2">
                  <div className="text-[10px] text-dsa-gold uppercase tracking-wider font-bold">Ergebnisse</div>
                  {restResults.map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-dsa-bg border border-dsa-bg-medium rounded-sm px-2 py-1.5">
                      <span className="text-dsa-parchment font-medium">{r.character_name}</span>
                      <span className="text-green-400 font-mono text-[10px]">{r.summary}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-2">
                <button onClick={() => { setShowRest(false); setRestResults(null) }} className="flex-1 px-3 py-2 text-xs border border-dsa-bg-medium rounded-sm text-dsa-parchment-dark hover:text-dsa-parchment transition">
                  {restResults ? 'Schließen' : 'Abbrechen'}
                </button>
                {!restResults && (
                  <button
                    onClick={handleRestStart}
                    disabled={restPending || Object.values(restCharIds).filter(Boolean).length === 0}
                    className="flex-1 px-3 py-2 text-xs bg-dsa-gold/20 border border-dsa-gold/30 text-dsa-gold rounded-sm hover:bg-dsa-gold/30 transition font-bold disabled:opacity-30 flex items-center justify-center gap-1.5"
                  >
                    {restPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Heart className="w-3.5 h-3.5" />}
                    Rast beginnen
                  </button>
                )}
              </div>
            </div>
          )}
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
