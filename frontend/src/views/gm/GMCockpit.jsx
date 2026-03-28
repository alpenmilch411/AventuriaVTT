import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Wifi, WifiOff, Users, Swords, Dice5, Heart, Shield,
  Bell, Pause, Play, X, Send, Plus, Minus, AlertTriangle,
  Package, ChevronDown, ChevronUp, Search, Trash2, Check, Skull, Star,
  Minimize2, Maximize2, MessageSquare, Gift, Moon, StickyNote, Timer, Coins, Scroll,
  Sparkles, Sun, ArrowLeft, Store
} from 'lucide-react'
import useWebSocket from '../../hooks/useWebSocket'
import { getConditions } from '../../utils/safeData'
import useGMControls from '../../hooks/useGMControls'
import useGameState from '../../hooks/useGameState'
import useOffline from '../../hooks/useOffline'
import useGMSession from '../../hooks/useGMSession'
import useGMPopups from '../../hooks/useGMPopups'
import useGMDatabank from '../../hooks/useGMDatabank'
import useSessionStore from '../../stores/sessionStore'
import useAuthStore from '../../stores/authStore'
import useCampaignStore from '../../stores/campaignStore'
import useCharacterStore from '../../stores/characterStore'
import useCombatStore from '../../stores/combatStore'
import CombatOverlay from './CombatOverlay'
import SessionPrep, { getSessionPool } from './SessionPrep'
import CampaignManager from '../auth/CampaignManager'
import CombatTracker from './CombatTracker'
import BattleManager from './BattleManager'
import LootPanel from './LootPanel'
import GroupInventoryPanel from './GroupInventoryPanel'
import ShopCreateModal from './ShopCreateModal'
import NotificationPanel from './NotificationPanel'
import ConditionPopup from './ConditionPopup'
import ProbeSetupPopup from './ProbeSetupPopup'
import VitalsPopup from './VitalsPopup'
import PlayerOverview, { PlayerDetailView } from './PlayerOverview'
import Modal from '../../components/common/Modal'
import SessionControls from './SessionControls'
import TurnFlow from './TurnFlow'
import QuestSessionTab from './QuestSessionTab'
import Badge from '../../components/common/Badge'
import ProgressBar from '../../components/common/ProgressBar'
import ActiveBuffs from '../../components/common/ActiveBuffs'
import SessionLog from '../../components/common/SessionLog'
import { getCreatureIcon, getItemIcon } from '../../utils/icons'
import clsx from 'clsx'

export default function GMCockpit() {
  const { sessionCode } = useParams()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const players = useSessionStore((s) => s.players)
  const notifications = useSessionStore((s) => s.notifications)
  const sessionLog = useSessionStore((s) => s.sessionLog)
  const sessionId = useSessionStore((s) => s.sessionId)
  const dismissNotification = useSessionStore((s) => s.dismissNotification)
  const battles = useCombatStore((s) => s.battles)
  const activeBattleId = useCombatStore((s) => s.activeBattleId)
  const activeBuffs = useCharacterStore((s) => s.activeBuffs)
  const activeProcesses = useSessionStore((s) => s.activeProcesses)

  // ── Extracted hooks ──
  const { isAuthorizedGM } = useGMSession(sessionCode)

  const popups = useGMPopups()
  const {
    showPrep, setShowPrep,
    showNotifications, setShowNotifications,
    showCombatOverlay, setShowCombatOverlay,
    victoryLoot, setVictoryLoot,
    showLoot, setShowLoot,
    showBattleSetup, setShowBattleSetup,
    combatMinimized, setCombatMinimized,
    selectedPlayerIds, setSelectedPlayerIds,
    expandedCards, setExpandedCards,
    quickAction, setQuickAction,
    probeTalent, setProbeTalent,
    probeDifficulty, setProbeDifficulty,
    probeSearch, setProbeSearch,
    whisperText, setWhisperText,
    healthInput, setHealthInput,
    npcDetail, setNpcDetail,
    showCampaignManager, setShowCampaignManager,
    showDiceRoller, setShowDiceRoller,
    diceFormula, setDiceFormula,
    diceResult, setDiceResult,
    showNotes, setShowNotes,
    showQuests, setShowQuests,
    showConditionPopup, setShowConditionPopup,
    showProbePopup, setShowProbePopup,
    showVitalsPopup, setShowVitalsPopup,
    gmNotes, setGmNotes,
    detailPlayer, setDetailPlayer,
    showGroupInventory, setShowGroupInventory,
    showShopCreate, setShowShopCreate,
  } = popups

  const { talentList, creatureList } = useGMDatabank({ showBattleSetup, showProbePopup })

  const { isOffline, OfflineBanner } = useOffline()

  const pendingActionCount = notifications.filter(n =>
    n.type === 'action_request' || n.type === 'probe_request_from_player' ||
    n.type === 'spell_cast_request' || n.type === 'transfer_request' || n.type === 'trade_gm_request'
  ).length

  const { connected, sendMessage } = useWebSocket(sessionCode, user?.id, 'gm')
  const gmControls = useGMControls(sendMessage)
  const { phase, isHalted } = useGameState()
  const campaign = useCampaignStore((s) => s.campaign)
  const activeBattle = battles[activeBattleId]
  const connectedCount = players.filter(p => p.connected).length

  // Open popups when quickAction is selected (moved out of render to avoid infinite loops)
  useEffect(() => {
    if (!quickAction || selectedPlayerIds.size === 0) return
    if (quickAction === 'probe' && !showProbePopup) setShowProbePopup(true)
    if (quickAction === 'health' && !showVitalsPopup) setShowVitalsPopup(true)
    if (quickAction === 'condition' && !showConditionPopup) setShowConditionPopup(true)
    if (quickAction === 'items' && !showLoot) {
      setShowLoot({ sourceName: 'Gegenstaende', sourceItems: [], targetPlayerIds: [...selectedPlayerIds] })
      setQuickAction(null)
    }
  }, [quickAction]) // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlayer = (id) => {
    setSelectedPlayerIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const selectAllPlayers = () => {
    setSelectedPlayerIds(new Set(players.map(p => p.id)))
  }

  const selectedPlayers = players.filter(p => selectedPlayerIds.has(p.id))

  const sendProbeToSelected = () => {
    if (!probeTalent || selectedPlayers.length === 0) return
    for (const p of selectedPlayers) {
      sendMessage?.({
        type: 'dice_request',
        payload: {
          target_user_id: p.id,
          type: 'talent_probe',
          label: `${probeTalent}${probeDifficulty ? ` (${probeDifficulty > 0 ? '+' : ''}${probeDifficulty})` : ''}`,
          talent_name: probeTalent,
          difficulty: probeDifficulty,
          dice: '3W20',
        },
      })
    }
    setProbeTalent('')
    setProbeDifficulty(0)
    setProbeSearch('')
    setQuickAction(null)
  }

  const sendHealthToSelected = () => {
    const val = parseInt(healthInput, 10)
    if (isNaN(val) || selectedPlayers.length === 0) return
    for (const p of selectedPlayers) {
      // Use delta — backend resolves to absolute
      sendMessage?.({ type: 'vitals_update', payload: { character_id: p.characterId, vitals: { lep_delta: -val } } })
    }
    setHealthInput('')
    setQuickAction(null)
  }

  const rollDice = (formula) => {
    const m = (formula || '1W6').match(/(\d+)[Ww](\d+)([+-]\d+)?/)
    if (!m) { setDiceResult({ total: Math.floor(Math.random() * 6) + 1, rolls: [null], bonus: 0 }); return }
    const count = parseInt(m[1]), sides = parseInt(m[2]), bonus = parseInt(m[3] || '0')
    const rolls = []
    for (let i = 0; i < count; i++) rolls.push(Math.floor(Math.random() * sides) + 1)
    const total = rolls.reduce((a, b) => a + b, 0) + bonus
    setDiceResult({ total, rolls, bonus })
    sendMessage?.({ type: 'combat_log_entry', payload: { type: 'roll', text: `SL wuerfelt ${formula}: ${total} [${rolls.join(', ')}${bonus ? ` + ${bonus}` : ''}]` } })
  }

  const sendWhisperToSelected = () => {
    if (!whisperText.trim() || selectedPlayers.length === 0) return
    for (const p of selectedPlayers) {
      sendMessage?.({ type: 'notification', payload: { target_user_id: p.id, text: whisperText, from: 'Spielleiter' } })
    }
    setWhisperText('')
    setQuickAction(null)
  }

  // ── RENDER ──

  if (isAuthorizedGM === false) {
    return (
      <div className="h-screen flex items-center justify-center bg-dsa-bg">
        <div className="text-center">
          <Shield className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-display text-red-400 mb-2">Kein Zugriff</h2>
          <p className="text-xs text-dsa-parchment-dark mb-4">Nur der Spielleiter kann diese Seite oeffnen.</p>
          <button onClick={() => navigate('/dashboard')} className="btn-primary text-xs">Zum Dashboard</button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-dsa-bg overflow-hidden">
      <OfflineBanner />

      {/* ── TOP BAR ── */}
      <header className="flex items-center justify-between px-4 py-2 bg-dsa-bg-light border-b border-dsa-bg-medium flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-1 text-dsa-parchment-dark hover:text-dsa-gold transition-colors"
            title="Zurück zur Übersicht"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-sm font-display font-bold text-dsa-gold">AventuriaVTT</h1>
          <Badge variant="default" size="sm">{sessionCode}</Badge>
          <div className="flex items-center gap-1 text-xs">
            {connected ? <Wifi className="w-3.5 h-3.5 text-green-400" /> : <WifiOff className="w-3.5 h-3.5 text-red-400" />}
            <span className={connected ? 'text-green-400' : 'text-red-400'}>{connected ? 'Verbunden' : 'Getrennt'}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-dsa-parchment-dark"><Users className="w-3.5 h-3.5 inline" /> {connectedCount}/{players.length}</span>
          {isHalted && <Badge variant="danger" size="sm">HALT</Badge>}
          {activeBattle && <Badge variant="warning" size="sm"><Swords className="w-3 h-3 inline" /> Kampf Runde {activeBattle.round}</Badge>}
          <button onClick={() => setShowPrep(true)}
            className="px-2 py-1 text-xs bg-dsa-bg text-dsa-parchment-dark border border-dsa-bg-medium rounded-sm hover:text-dsa-gold hover:border-dsa-gold/30 transition">
            Session-Material
          </button>
          <button onClick={() => setShowCampaignManager(true)}
            className="px-2 py-1 text-xs bg-dsa-bg text-dsa-parchment-dark border border-dsa-bg-medium rounded-sm hover:text-dsa-gold hover:border-dsa-gold/30 transition">
            Kampagne
          </button>
          <button onClick={() => setShowQuests(true)}
            className="px-2 py-1 text-xs bg-dsa-bg text-dsa-parchment-dark border border-dsa-bg-medium rounded-sm hover:text-dsa-gold hover:border-dsa-gold/30 transition flex items-center gap-1">
            <Scroll className="w-3 h-3" /> Quests
          </button>
          <button onClick={() => setShowGroupInventory(true)}
            className="px-2 py-1 text-xs bg-dsa-bg text-dsa-parchment-dark border border-dsa-bg-medium rounded-sm hover:text-dsa-gold hover:border-dsa-gold/30 transition flex items-center gap-1">
            <Package className="w-3 h-3" /> Inventar
          </button>
          <button onClick={() => setShowShopCreate(true)}
            className="px-2 py-1 text-xs bg-dsa-bg text-dsa-parchment-dark border border-dsa-bg-medium rounded-sm hover:text-dsa-gold hover:border-dsa-gold/30 transition flex items-center gap-1">
            <Store className="w-3 h-3" /> Laden
          </button>
          {/* Unified notification bell */}
          {(() => {
            const activeProbes = activeProcesses.filter(p => p.type === 'probe')
            const totalCount = pendingActionCount + activeProbes.length
            return (
              <button onClick={() => setShowNotifications(true)} className="relative p-1">
                <Bell className={clsx('w-4.5 h-4.5', totalCount > 0 ? 'text-dsa-gold' : 'text-dsa-parchment-dark')} />
                {totalCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] rounded-full flex items-center justify-center animate-pulse">{totalCount}</span>
                )}
              </button>
            )
          })()}
          <button onClick={() => isHalted ? gmControls.releaseHalt() : gmControls.halt()}
            className={clsx('p-1.5 rounded-sm transition', isHalted ? 'bg-red-900/30 text-red-400' : 'text-dsa-parchment-dark hover:text-dsa-parchment')}
            title={isHalted ? 'Freigeben' : 'Halt'}>
            {isHalted ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* ── MAIN 3-COLUMN LAYOUT ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT: Players + Quick Actions ── */}
        <div className="w-72 flex-shrink-0 border-r border-dsa-bg-medium bg-dsa-bg-light overflow-y-auto flex flex-col">
          {/* Player List with multi-select */}
          <div className="p-3 space-y-1">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xs font-semibold text-dsa-gold flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> Spieler ({connectedCount}/{players.length})
              </h2>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setExpandedCards(expandedCards.size === players.length ? new Set() : new Set(players.map(p => p.id)))}
                  className="text-[9px] text-dsa-parchment-dark hover:text-dsa-gold transition">
                  {expandedCards.size === players.length ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                </button>
                <button onClick={selectedPlayerIds.size === players.length ? () => setSelectedPlayerIds(new Set()) : selectAllPlayers}
                  className="text-[9px] text-dsa-parchment-dark hover:text-dsa-gold transition">
                  {selectedPlayerIds.size === players.length ? 'Keine' : 'Alle'}
                </button>
              </div>
            </div>
            {players.map(p => {
              const cv = p.current_vitals || {}
              const dv = p.character?.derived_values || {}
              const lep = cv.lep ?? p.currentLeP ?? dv.LeP_max ?? 30
              const lepMax = dv.LeP_max ?? 30
              const asp = cv.asp ?? p.currentAsP ?? dv.AsP_max ?? 0
              const aspMax = dv.AsP_max ?? 0
              const kap = cv.kap ?? p.currentKaP ?? dv.KaP_max ?? 0
              const kapMax = dv.KaP_max ?? 0
              const charName = p.character?.name || p.username
              const selected = selectedPlayerIds.has(p.id)
              const isOnline = !!p.connected
              const lepPct = lepMax > 0 ? lep / lepMax : 1
              const isCritical = lepPct < 0.25
              const isHurt = lepPct < 0.75
              const conds = getConditions(p)
              return (
                <div
                  key={p.id}
                  onClick={() => setDetailPlayer(p)}
                  className={clsx(
                    'w-full text-left rounded-sm px-2.5 py-2 border transition cursor-pointer',
                    !isOnline && 'opacity-70',
                    selected ? 'bg-dsa-bg border-dsa-gold/50 ring-1 ring-dsa-gold/20' : 'bg-dsa-bg border-dsa-bg-medium hover:border-dsa-gold/30'
                  )}
                >
                  {/* Row 1: Checkbox + Name + Expand toggle + Online */}
                  <div className="flex items-center gap-2">
                    <div
                      onClick={(e) => { e.stopPropagation(); togglePlayer(p.id) }}
                      className={clsx('w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition cursor-pointer hover:border-dsa-gold',
                        selected ? 'bg-dsa-gold border-dsa-gold' : 'border-dsa-bg-medium')}
                    >
                      {selected && <Check className="w-2.5 h-2.5 text-dsa-bg" />}
                    </div>
                    <span className="text-xs font-semibold text-dsa-parchment truncate flex-1">{charName}</span>
                    <button onClick={(e) => { e.stopPropagation(); setExpandedCards(prev => { const next = new Set(prev); next.has(p.id) ? next.delete(p.id) : next.add(p.id); return next }) }}
                      className="text-dsa-parchment-dark/40 hover:text-dsa-gold transition flex-shrink-0 p-0.5">
                      {expandedCards.has(p.id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', isOnline ? 'bg-green-400 animate-pulse' : 'bg-red-400')} />
                  </div>

                  {/* Vitals — collapsible */}
                  {expandedCards.has(p.id) && <div className="space-y-1 ml-5.5 pl-0.5 mt-1.5">
                    {/* Lebensenergie */}
                    <div className="flex items-center gap-1.5">
                      <Heart className={clsx('w-3 h-3 flex-shrink-0', isCritical ? 'text-red-500' : isHurt ? 'text-yellow-500' : 'text-dsa-blood')} />
                      <div className="flex-1 h-2 bg-dsa-bg-card rounded-full overflow-hidden border border-dsa-bg-medium/30">
                        <div className={clsx('h-full rounded-full transition-all duration-700',
                          lepPct <= 0.25 ? 'bg-gradient-to-r from-red-600 to-red-500' : lepPct <= 0.5 ? 'bg-gradient-to-r from-yellow-600 to-yellow-500' : 'bg-gradient-to-r from-green-600 to-green-500'
                        )} style={{ width: `${Math.max(0, lepPct * 100)}%` }} />
                      </div>
                      <span className={clsx('text-[9px] font-mono w-11 text-right', isCritical ? 'text-red-400 font-bold' : 'text-dsa-parchment-dark')}>{lep}/{lepMax}</span>
                    </div>
                    {/* Astralenergie */}
                    <div className="flex items-center gap-1.5">
                      <Sparkles className={clsx('w-3 h-3 flex-shrink-0', aspMax > 0 ? 'text-dsa-mana' : 'text-blue-400/30')} />
                      <div className="flex-1 h-2 bg-dsa-bg-card rounded-full overflow-hidden border border-dsa-bg-medium/30 relative">
                        {aspMax > 0 ? (
                          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-700" style={{ width: `${Math.max(0, asp / aspMax * 100)}%` }} />
                        ) : (
                          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(96,165,250,0.15) 3px, rgba(96,165,250,0.15) 6px)' }} />
                        )}
                      </div>
                      <span className="text-[9px] font-mono w-11 text-right" style={{ color: aspMax > 0 ? undefined : 'var(--tw-text-opacity, 1)' }}>
                        <span className={aspMax > 0 ? 'text-dsa-mana/70' : 'text-dsa-parchment-dark/40'}>{aspMax > 0 ? `${asp}/${aspMax}` : 'n.a.'}</span>
                      </span>
                    </div>
                    {/* Karmaenergie */}
                    <div className="flex items-center gap-1.5">
                      <Sun className={clsx('w-3 h-3 flex-shrink-0', kapMax > 0 ? 'text-dsa-karma' : 'text-purple-400/30')} />
                      <div className="flex-1 h-2 bg-dsa-bg-card rounded-full overflow-hidden border border-dsa-bg-medium/30 relative">
                        {kapMax > 0 ? (
                          <div className="h-full rounded-full bg-gradient-to-r from-purple-400 to-purple-600 transition-all duration-700" style={{ width: `${Math.max(0, kap / kapMax * 100)}%` }} />
                        ) : (
                          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(168,85,247,0.15) 3px, rgba(168,85,247,0.15) 6px)' }} />
                        )}
                      </div>
                      <span className="text-[9px] font-mono w-11 text-right">
                        <span className={kapMax > 0 ? 'text-dsa-karma/70' : 'text-dsa-parchment-dark/40'}>{kapMax > 0 ? `${kap}/${kapMax}` : 'n.a.'}</span>
                      </span>
                    </div>
                    {/* Zustände */}
                    {conds.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 pt-0.5">
                        {conds.map((c, i) => {
                          const name = typeof c === 'string' ? c : c.name
                          const level = typeof c === 'string' ? 1 : (c.level || 1)
                          return (
                            <span key={i} className="text-[7px] px-1.5 py-0.5 rounded-sm bg-amber-900/30 text-amber-400 border border-amber-800/20 flex items-center gap-0.5">
                              <AlertTriangle className="w-2 h-2" />
                              {name}{level > 1 ? ` Stufe ${level}` : ''}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>}
                </div>
              )
            })}
          </div>

          {/* Action Icons Bar */}
          <div className="px-3 pb-2">
            <div className="flex items-center justify-around bg-dsa-bg rounded p-1.5 border border-dsa-bg-medium">
              {[
                { id: 'probe', icon: Dice5, label: 'Probe', color: 'text-dsa-gold' },
                { id: 'health', icon: Heart, label: 'Energien', color: 'text-red-400' },
                { id: 'condition', icon: AlertTriangle, label: 'Zustand', color: 'text-amber-400' },
                { id: 'items', icon: Gift, label: 'Items', color: 'text-emerald-400' },
                { id: 'whisper', icon: MessageSquare, label: 'Fluestern', color: 'text-blue-400' },
              ].map(a => (
                <button
                  key={a.id}
                  onClick={() => {
                    // Auto-select all connected players if none selected
                    if (selectedPlayerIds.size === 0) selectAllPlayers()
                    setQuickAction(quickAction === a.id ? null : a.id)
                  }}
                  className={clsx(
                    'flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-sm transition text-[9px] font-medium',
                    quickAction === a.id ? `${a.color} bg-dsa-bg-medium` : 'text-dsa-parchment-dark hover:text-dsa-parchment'
                  )}
                  title={a.label}
                >
                  <a.icon className="w-4 h-4" />
                  {a.label}
                </button>
              ))}
            </div>
            {selectedPlayerIds.size > 0 && !quickAction && (
              <p className="text-[9px] text-dsa-parchment-dark text-center mt-1">
                {selectedPlayerIds.size} Spieler ausgewaehlt
              </p>
            )}
          </div>

          {/* Quick Action Panel */}
          {quickAction && (
            <div className="px-3 pb-3">
              <div className="bg-dsa-bg rounded p-3 border border-dsa-bg-medium space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-dsa-parchment">
                    {quickAction === 'probe' && `Probe (${selectedPlayers.length} Spieler)`}
                    {quickAction === 'health' && `Schaden/Heilung (${selectedPlayers.length} Spieler)`}
                    {quickAction === 'items' && `Items geben (${selectedPlayers.length} Spieler)`}
                    {quickAction === 'condition' && `Zustand (${selectedPlayers.length} Spieler)`}
                    {quickAction === 'whisper' && `Nachricht (${selectedPlayers.length} Spieler)`}
                  </span>
                  <button onClick={() => setQuickAction(null)} className="text-dsa-parchment-dark hover:text-dsa-parchment"><X className="w-3 h-3" /></button>
                </div>


                {quickAction === 'whisper' && (
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap gap-1">
                      {['Du hoerst...', 'Du siehst...', 'Du spuerst...', 'Du erinnerst dich...', 'Nur du bemerkst...'].map(t => (
                        <button key={t} onClick={() => setWhisperText(prev => prev ? prev + ' ' + t : t)}
                          className="text-[8px] px-1.5 py-0.5 bg-blue-900/20 text-blue-400/70 rounded hover:text-blue-400 transition">
                          {t}
                        </button>
                      ))}
                    </div>
                    <textarea value={whisperText} onChange={e => setWhisperText(e.target.value)}
                      placeholder="Nachricht eingeben..." rows={3} className="input-field text-[10px] w-full resize-none" autoFocus />
                    <button onClick={sendWhisperToSelected} disabled={!whisperText.trim()}
                      className={clsx('w-full text-[10px] py-1.5 rounded-sm transition flex items-center justify-center gap-1',
                        whisperText.trim() ? 'bg-blue-900/20 text-blue-400 hover:bg-blue-900/30' : 'bg-dsa-bg-medium text-dsa-parchment-dark/40 cursor-not-allowed')}>
                      <Send className="w-3 h-3" /> Senden
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-dsa-bg-medium mx-3" />

          {/* Combat / Loot / Notifications */}
          <div className="p-3 space-y-2">
            {/* Combat / Loot buttons */}
            {!activeBattle ? (
              <button onClick={() => setShowBattleSetup(true)}
                className="w-full text-[10px] py-1.5 bg-red-900/20 text-red-400 rounded-sm hover:bg-red-900/30 transition flex items-center justify-center gap-1">
                <Swords className="w-3 h-3" /> Kampf starten
              </button>
            ) : combatMinimized ? (
              <button onClick={() => setCombatMinimized(false)}
                className="w-full text-[10px] py-1.5 bg-red-900/20 text-red-400 rounded-sm hover:bg-red-900/30 transition flex items-center justify-center gap-1 animate-pulse">
                <Maximize2 className="w-3 h-3" /> Kampf oeffnen (Runde {activeBattle.round})
              </button>
            ) : (
              <button onClick={() => setCombatMinimized(true)}
                className="w-full text-[10px] py-1.5 bg-red-900/20 text-red-400 rounded-sm hover:bg-red-900/30 transition flex items-center justify-center gap-1">
                <Minimize2 className="w-3 h-3" /> Kampf minimieren
              </button>
            )}

            <button onClick={() => setShowLoot({ sourceName: 'Beute', sourceItems: [] })}
              className="w-full text-[10px] py-1.5 bg-dsa-gold/10 text-dsa-gold rounded-sm hover:bg-dsa-gold/20 transition flex items-center justify-center gap-1">
              <Package className="w-3 h-3" /> Beute verteilen
            </button>
          </div>

          {/* GM Tools */}
          <div className="border-t border-dsa-bg-medium mx-3" />
          <div className="p-3 space-y-2">
            <h2 className="text-xs font-semibold text-dsa-gold mb-1">Werkzeuge</h2>

            {/* Quick Dice Roller */}
            <button onClick={() => setShowDiceRoller(!showDiceRoller)}
              className="w-full text-[10px] py-1.5 bg-dsa-bg rounded-sm border border-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-parchment hover:border-dsa-gold/20 transition flex items-center justify-center gap-1">
              <Dice5 className="w-3 h-3" /> Wuerfelroller
            </button>
            {showDiceRoller && (
              <div className="bg-dsa-bg rounded p-2.5 border border-dsa-bg-medium space-y-2">
                <div className="flex gap-1">
                  {['1W6', '1W20', '2W6', '3W6', '1W6+4', '2W6+2'].map(f => (
                    <button key={f} onClick={() => { setDiceFormula(f); rollDice(f) }}
                      className={clsx('text-[9px] px-1.5 py-1 rounded transition',
                        diceFormula === f ? 'bg-dsa-gold/20 text-dsa-gold' : 'bg-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-parchment')}>
                      {f}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input value={diceFormula} onChange={e => setDiceFormula(e.target.value)}
                    className="input-field text-[10px] flex-1" placeholder="z.B. 3W6+5" />
                  <button onClick={() => rollDice(diceFormula)}
                    className="text-[10px] px-2 py-1 bg-dsa-gold/20 text-dsa-gold rounded-sm hover:bg-dsa-gold/30 transition">
                    Wuerfeln
                  </button>
                </div>
                {diceResult !== null && (
                  <div className="text-center py-1.5 bg-dsa-bg-card rounded-sm border border-dsa-gold/20">
                    <span className="text-2xl font-mono font-bold text-dsa-gold">{diceResult.total}</span>
                    {diceResult.rolls && <span className="text-[9px] text-dsa-parchment-dark ml-2">[{diceResult.rolls.join(', ')}]{diceResult.bonus ? ` + ${diceResult.bonus}` : ''}</span>}
                  </div>
                )}
              </div>
            )}

            {/* Rest / Camp */}
            <button onClick={() => {
              const healAmount = Math.max(1, Math.floor(Math.random() * 6) + 1) // 1W6 per rest
              for (const p of players) {
                if (!p.characterId) continue
                const dv = p.character?.derived_values || {}
                // Use delta for LeP heal, absolute for full ASP/KAP restore
                sendMessage?.({ type: 'vitals_update', payload: { character_id: p.characterId, vitals: { lep_delta: healAmount, asp: dv.AsP_max || 0, kap: dv.KaP_max || 0 } } })
              }
              sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `Die Gruppe rastet. Alle regenerieren ${healAmount} LeP, AsP und KaP vollstaendig wiederhergestellt.` } })
            }}
              className="w-full text-[10px] py-1.5 bg-dsa-bg rounded-sm border border-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-parchment hover:border-dsa-gold/20 transition flex items-center justify-center gap-1">
              <Moon className="w-3 h-3" /> Rast (Regeneration)
            </button>

            {/* GM Notes */}
            <button onClick={() => setShowNotes(!showNotes)}
              className="w-full text-[10px] py-1.5 bg-dsa-bg rounded-sm border border-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-parchment hover:border-dsa-gold/20 transition flex items-center justify-center gap-1">
              <StickyNote className="w-3 h-3" /> Notizen {gmNotes ? '•' : ''}
            </button>
            {showNotes && (
              <div className="bg-dsa-bg rounded p-2.5 border border-dsa-bg-medium">
                <textarea value={gmNotes}
                  onChange={e => { setGmNotes(e.target.value); try { localStorage.setItem('aventuria_gm_notes', e.target.value) } catch {} }}
                  placeholder="Notizen fuer diese Sitzung..."
                  rows={6} className="input-field text-[10px] w-full resize-none" />
                <p className="text-[8px] text-dsa-parchment-dark/40 mt-1">Automatisch gespeichert</p>
              </div>
            )}
          </div>

          {/* Notification count hint */}
          {pendingActionCount > 0 && (
            <div className="p-3 border-t border-dsa-bg-medium">
              <button onClick={() => setShowNotifications(true)}
                className="w-full text-[10px] py-1.5 bg-amber-900/20 text-amber-400 rounded-sm hover:bg-amber-900/30 transition flex items-center justify-center gap-1 animate-pulse">
                <Bell className="w-3 h-3" /> {pendingActionCount} Anfrage{pendingActionCount > 1 ? 'n' : ''} offen
              </button>
            </div>
          )}
        </div>

        {/* ── CENTER: Combat + Protokoll ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeBattle && !combatMinimized ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <CombatTracker sendMessage={sendMessage} gmControls={gmControls} onMinimize={() => setCombatMinimized(true)} />
            </div>
          ) : showBattleSetup ? (
            <BattleSetup
              players={players}
              creatureList={creatureList}
              token={token}
              sendMessage={sendMessage}
              gmControls={gmControls}
              onStartCombat={(battleId) => { setShowBattleSetup(false) }}
              onCancel={() => setShowBattleSetup(false)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-center p-8">
              <div>
                {activeBattle && combatMinimized ? (
                  <>
                    <Swords className="w-16 h-16 text-red-400/40 mx-auto mb-4 animate-pulse" />
                    <h2 className="text-lg font-display text-dsa-parchment-dark mb-2">Kampf laeuft (Runde {activeBattle.round})</h2>
                    <p className="text-xs text-dsa-parchment-dark/60 max-w-sm mx-auto mb-4">
                      Kampf ist minimiert. Du kannst Proben senden oder Beute verteilen.
                    </p>
                    <button onClick={() => setCombatMinimized(false)}
                      className="px-4 py-2 bg-red-900/30 text-red-400 rounded-sm hover:bg-red-900/40 transition flex items-center gap-2 mx-auto text-sm font-semibold">
                      <Maximize2 className="w-4 h-4" /> Kampf oeffnen
                    </button>
                  </>
                ) : (
                  <>
                    <Swords className="w-16 h-16 text-dsa-bg-medium mx-auto mb-4" />
                    <h2 className="text-lg font-display text-dsa-parchment-dark mb-2">Bereit</h2>
                    <p className="text-xs text-dsa-parchment-dark/60 max-w-sm mx-auto">
                      {connectedCount === 0 ? 'Warte auf Spieler...' :
                       `${connectedCount} Spieler verbunden. Starte einen Kampf, sende Proben oder verteile Beute.`}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Protokoll — below combat/empty state ── */}
          <div className="h-48 flex-shrink-0 border-t border-dsa-bg-medium bg-dsa-bg-light flex flex-col">
            <div className="px-3 py-1.5 border-b border-dsa-bg-medium/50 flex-shrink-0 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-dsa-gold">Protokoll</h2>
              <span className="text-[9px] text-dsa-parchment-dark">{sessionLog.length} Einträge</span>
            </div>
            <div className="flex-1 overflow-hidden">
              <SessionLog entries={sessionLog} maxHeight="100%" compact />
            </div>
          </div>
        </div>

        {/* ── RIGHT: NPC Panel ── */}
        <div className="w-56 flex-shrink-0 border-l border-dsa-bg-medium bg-dsa-bg-light flex flex-col">
          <NPCPanel creatureList={creatureList} onSelect={setNpcDetail} />
        </div>
      </div>

      {/* ── FLOATING MODALS ── */}

      {/* Unified Notification Center */}
      {showNotifications && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowNotifications(false)}>
          <div className="bg-dsa-bg border border-dsa-bg-medium rounded shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-dsa-bg-medium sticky top-0 bg-dsa-bg z-10">
              <h2 className="text-sm font-display font-bold text-dsa-gold flex items-center gap-2">
                <Bell className="w-4 h-4" /> Benachrichtigungen
              </h2>
              <button onClick={() => setShowNotifications(false)} className="text-dsa-parchment-dark hover:text-dsa-parchment"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {/* Active probes */}
              {activeProcesses.filter(p => p.type === 'probe').map(p => (
                <button key={p.id} onClick={() => { setShowProbePopup(true); setShowNotifications(false) }}
                  className="w-full bg-dsa-gold/10 border border-dsa-gold/30 rounded-sm p-3 text-left hover:bg-dsa-gold/20 transition">
                  <div className="flex items-center gap-2">
                    <Dice5 className="w-5 h-5 text-dsa-gold" />
                    <div>
                      <p className="text-xs text-dsa-gold font-bold">{p.label}</p>
                      <p className="text-[10px] text-dsa-parchment-dark">Aktive Probe — klicken zum Öffnen</p>
                    </div>
                  </div>
                </button>
              ))}

              {/* Player requests */}
              <NotificationPanel sendMessage={sendMessage} />

              {activeProcesses.length === 0 && pendingActionCount === 0 && (
                <p className="text-xs text-dsa-parchment-dark/40 text-center py-4">Keine Benachrichtigungen</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Session Prep — full screen overlay */}
      {showPrep && (
        <div className="fixed inset-0 z-50 bg-dsa-bg">
          <SessionPrep onClose={() => setShowPrep(false)} />
        </div>
      )}

      {/* Quest & Session Panel */}
      {/* ── Condition Management Popup ── */}
      {/* ── Probe Setup Popup ── */}
      {/* ── Vitals Popup ── */}
      {showVitalsPopup && (
        <VitalsPopup
          players={selectedPlayers}
          sendMessage={sendMessage}
          onClose={() => { setShowVitalsPopup(false); setQuickAction(null) }}
        />
      )}

      {showProbePopup && (
        <ProbeSetupPopup
          players={selectedPlayers}
          sendMessage={sendMessage}
          talentList={talentList}
          onClose={() => { setShowProbePopup(false); setQuickAction(null) }}
          onMinimize={() => { setShowProbePopup(false); setQuickAction(null) }}
        />
      )}

      {showConditionPopup && (
        <ConditionPopup
          players={selectedPlayers}
          sendMessage={sendMessage}
          onClose={() => { setShowConditionPopup(false); setQuickAction(null) }}
        />
      )}

      {/* Player Detail Modal — reads live data from stores */}
      {detailPlayer && (
        <LivePlayerDetailModal
          playerId={detailPlayer.id}
          onClose={() => setDetailPlayer(null)}
          sendMessage={sendMessage}
          gmControls={gmControls}
        />
      )}


      {showQuests && (
        <div className="fixed inset-0 z-50 bg-dsa-bg">
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-dsa-bg-medium bg-dsa-bg-card">
              <span className="text-sm font-display font-bold text-dsa-gold">Quests & Session</span>
              <button onClick={() => setShowQuests(false)} className="text-dsa-parchment-dark hover:text-dsa-parchment"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-hidden">
              <QuestSessionTab
                campaignId={useCampaignStore.getState().campaign?.id}
                sessionId={sessionId}
                sendMessage={sendMessage}
              />
            </div>
          </div>
        </div>
      )}

      {/* Combat Overlay */}
      {showCombatOverlay && (
        <CombatOverlay
          battleId={showCombatOverlay}
          onClose={() => setShowCombatOverlay(null)}
          onVictoryLoot={(data) => {
            const preparedLoot = window._preparedBattleLoot
            if (preparedLoot && preparedLoot.length > 0) {
              setVictoryLoot({ deadNPCs: data.deadNPCs, preparedItems: preparedLoot })
              window._preparedBattleLoot = null
            } else {
              setVictoryLoot(data)
            }
          }}
          sendMessage={sendMessage}
          mapTokens={[]}
        />
      )}

      {/* Victory Loot Panel */}
      {victoryLoot && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl">
            <LootPanel
              sourceName={victoryLoot.deadNPCs.join(', ')}
              sourceItems={victoryLoot.preparedItems || victoryLoot.loot?.flatMap(l => l.items) || []}
              onClose={() => setVictoryLoot(null)}
              sendMessage={sendMessage}
            />
          </div>
        </div>
      )}

      {/* Manual Loot Panel */}
      {showLoot && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl">
            <LootPanel
              sourceName={showLoot.sourceName}
              sourceItems={showLoot.sourceItems}
              onClose={() => setShowLoot(null)}
              sendMessage={sendMessage}
            />
          </div>
        </div>
      )}

      {/* NPC Detail Modal */}
      {npcDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setNpcDetail(null)}>
          <div className="bg-dsa-bg border border-dsa-bg-medium rounded shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <NPCDetailView creature={npcDetail} onClose={() => setNpcDetail(null)} />
          </div>
        </div>
      )}

      {/* Campaign Manager */}
      {showCampaignManager && campaign?.id && (
        <CampaignManager campaignId={campaign.id} onClose={() => setShowCampaignManager(false)} />
      )}

      {/* Shop Create Modal */}
      {showShopCreate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowShopCreate(false)}>
          <div onClick={e => e.stopPropagation()}>
            <ShopCreateModal
              sendMessage={sendMessage}
              onClose={() => setShowShopCreate(false)}
            />
          </div>
        </div>
      )}

      {/* Group Inventory */}
      {showGroupInventory && campaign?.id && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowGroupInventory(false)}>
          <div onClick={e => e.stopPropagation()}>
            <GroupInventoryPanel
              campaignId={campaign.id}
              sendMessage={sendMessage}
              onClose={() => setShowGroupInventory(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// LivePlayerDetailModal — reads live data from stores so it updates in real-time
// ═══════════════════════════════════════════════════════════════

function LivePlayerDetailModal({ playerId, onClose, sendMessage, gmControls }) {
  const players = useSessionStore((s) => s.players)
  const allCharacters = useCharacterStore((s) => s.allCharacters)
  const player = players.find(p => p.id === playerId)
  if (!player) return null

  const char = allCharacters.find(c => c.id === player.characterId) || player.character || {}
  const vitals = (() => {
    const cv = player.current_vitals || char.current_vitals || {}
    const dv = char.derived_values || {}
    return { lep: cv.lep ?? dv.LeP_max ?? 0, asp: cv.asp ?? dv.AsP_max ?? 0, kap: cv.kap ?? dv.KaP_max ?? 0, schip: cv.schip ?? dv.Schip ?? 0 }
  })()
  const maxVitals = (() => {
    const dv = char.derived_values || {}
    return { lepMax: dv.LeP_max ?? 0, aspMax: dv.AsP_max ?? 0, kapMax: dv.KaP_max ?? 0, schipMax: dv.Schip ?? 3 }
  })()
  const conditions = getConditions({ ...player, ...char })

  return (
    <Modal isOpen onClose={onClose} title={char.name || player.username || 'Spieler'} size="lg">
      <PlayerDetailView
        player={{ ...player, character: char, vitals, maxVitals, conditions }}
        sendMessage={sendMessage}
        gmControls={gmControls}
        onClose={onClose}
      />
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════
// BattleSetup — Pick players + creatures, then start combat
// ═══════════════════════════════════════════════════════════════

function BattleSetup({ players, creatureList, token, sendMessage, gmControls, onStartCombat, onCancel }) {
  const createBattle = useCombatStore((s) => s.createBattle)
  const addCombatant = useCombatStore((s) => s.addCombatant)
  const allChars = useCharacterStore((s) => s.allCharacters)

  const [combatants, setCombatants] = useState([])
  const [battleName, setBattleName] = useState('')
  // Player selection
  const [selectedPlayers, setSelectedPlayers] = useState(new Set(players.filter(p => p.connected && p.character).map(p => p.id)))
  const [playerSearch, setPlayerSearch] = useState('')
  // NPC selection
  const [selectedNpcs, setSelectedNpcs] = useState(new Set())
  const [npcSearch, setNpcSearch] = useState('')
  // Loot selection
  const [selectedLoot, setSelectedLoot] = useState([]) // [{ name, quantity }]
  const [lootSearch, setLootSearch] = useState('')
  const [showLootPicker, setShowLootPicker] = useState(false)
  const [lootChecked, setLootChecked] = useState(new Set()) // item IDs checked in picker
  const [activeTab, setActiveTab] = useState('combatants') // 'combatants' | 'loot'

  const [itemList, setItemList] = useState([])
  const [weaponList, setWeaponList] = useState([])
  const [armorList, setArmorList] = useState([])

  const pool = getSessionPool()
  const poolCreatures = pool.creatures || []
  const poolItems = pool.items || []
  const poolWeapons = pool.weapons || []
  const poolArmor = pool.armor || []
  // Merge pool + databank
  const poolCreatureIds = new Set(poolCreatures.map(c => c.id))
  const allCreatures = [...poolCreatures, ...creatureList.filter(c => !poolCreatureIds.has(c.id))]
  const poolItemIds = new Set(poolItems.map(i => i.id))
  const allItems = [
    ...poolItems,
    ...poolWeapons,
    ...poolArmor,
    ...itemList.filter(i => !poolItemIds.has(i.id)),
    ...weaponList.filter(i => !poolItemIds.has(i.id)),
    ...armorList.filter(i => !poolItemIds.has(i.id)),
  ]

  // Fetch items, weapons, armor for loot picker
  useEffect(() => {
    if (!token) return
    const headers = { Authorization: `Bearer ${token}` }
    const fetch80 = (cat) => fetch(`/api/databank/${cat}?per_page=80`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then(data => Array.isArray(data) ? data : (data.items || []))
      .catch(() => [])
    if (itemList.length === 0) fetch80('items').then(setItemList)
    if (weaponList.length === 0) fetch80('weapons').then(setWeaponList)
    if (armorList.length === 0) fetch80('armor').then(setArmorList)
  }, [token])

  // Auto-add loot from selected creatures' guaranteed_loot
  useEffect(() => {
    const creatureLoot = []
    for (const npcId of selectedNpcs) {
      const creature = allCreatures.find(c => c.id === npcId)
      if (creature?.guaranteed_loot) {
        for (const l of creature.guaranteed_loot) {
          const name = typeof l === 'string' ? l : l.name
          if (name && !creatureLoot.some(cl => cl.name === name)) {
            creatureLoot.push({ name, quantity: typeof l === 'object' ? (l.quantity || 1) : 1, fromCreature: creature.name })
          }
        }
      }
    }
    // Merge with manually added loot (don't remove manual entries)
    setSelectedLoot(prev => {
      const manual = prev.filter(l => !l.fromCreature)
      const merged = [...manual]
      for (const cl of creatureLoot) {
        if (!merged.some(m => m.name === cl.name)) merged.push(cl)
      }
      return merged
    })
  }, [selectedNpcs.size])

  const togglePlayer = (id) => setSelectedPlayers(prev => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next
  })
  const toggleNpc = (id) => setSelectedNpcs(prev => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next
  })

  const buildPlayerCombatant = (p) => {
    const char = allChars.find(c => c.id === p.characterId) || p.character
    const cv = char?.combat_values || {}
    const dv = char?.derived_values || {}
    const weapons = cv.weapons || []
    const primary = weapons[0] || {}
    return {
      id: `player_${p.id}`, name: char?.name || p.username, userId: p.id, characterId: p.characterId, isNPC: false,
      lep: (char?.current_vitals || {}).lep ?? dv.LeP_max ?? 30, lepMax: dv.LeP_max ?? 30,
      at: primary.AT || 12, pa: primary.PA || 8, aw: dv.AW || 5, rs: cv.RS || 0, iniBasis: dv.INI_basis || 10,
      weaponName: primary.name || 'Unbewaffnet', weaponDamage: primary.TP || primary.damage || '1W6', weaponReach: primary.reach || 'kurz',
      attacks: weapons.map(w => ({ name: w.name, at: w.AT, pa: w.PA, damage: w.TP || w.damage, reach: w.reach, isRanged: w.ranged || false })),
    }
  }

  const buildNpcCombatant = (creature) => {
    const cv = creature.combat_values || {}
    const atks = creature.attacks || []
    const primary = atks[0] || {}
    return {
      id: `creature_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: creature.name, isNPC: true,
      lep: cv.LeP || 20, lepMax: cv.LeP || 20,
      at: primary.AT || 12, pa: primary.PA || cv.PA || 8, aw: cv.AW || 5, rs: cv.RS || 0, iniBasis: cv.INI_basis || 10,
      weaponName: primary.name || 'Angriff', weaponDamage: primary.damage || '1W6+4', weaponReach: primary.reach || 'mittel',
      attacks: atks.map(a => ({ name: a.name, at: a.AT, pa: a.PA, damage: a.damage, reach: a.reach, isRanged: a.reach === null || a.special?.includes('Fern') })),
      loot: creature.guaranteed_loot || [],
    }
  }

  const startBattle = () => {
    const allCombatants = [
      ...players.filter(p => selectedPlayers.has(p.id) && p.character).map(buildPlayerCombatant),
      ...Array.from(selectedNpcs).map(npcId => {
        const creature = allCreatures.find(c => c.id === npcId)
        return creature ? buildNpcCombatant(creature) : null
      }).filter(Boolean),
    ]
    if (allCombatants.length < 2) return
    const name = battleName.trim() || 'Kampf'
    const battleId = createBattle(name)
    // Auto-roll initiative: INI_basis + 1W6 for each combatant
    const withInitiative = allCombatants.map(c => {
      const iniRoll = Math.floor(Math.random() * 6) + 1
      return { ...c, iniRoll, initiative: (c.iniBasis || 10) + iniRoll, conditions: [] }
    }).sort((a, b) => b.initiative - a.initiative)
    for (const c of withInitiative) addCombatant(battleId, c)
    // Store prepared loot on window so CombatOverlay can use it for victory loot
    window._preparedBattleLoot = selectedLoot.length > 0 ? selectedLoot : null
    sendMessage?.({ type: 'combat_start', payload: { name, combatants: withInitiative } })
    gmControls.changePhase?.('combat')
    onStartCombat(battleId)
  }

  const filteredPlayers = playerSearch
    ? players.filter(p => p.character && (p.character.name || p.username || '').toLowerCase().includes(playerSearch.toLowerCase()))
    : players.filter(p => p.character)

  const filteredNpcs = npcSearch
    ? allCreatures.filter(c => (c.name || '').toLowerCase().includes(npcSearch.toLowerCase()))
    : allCreatures

  const filteredLootItems = lootSearch
    ? allItems.filter(i => (i.name || '').toLowerCase().includes(lootSearch.toLowerCase()))
    : allItems

  const toggleLootItem = (item) => {
    setLootChecked(prev => {
      const next = new Set(prev); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next
    })
  }

  const addCheckedLoot = () => {
    const newLoot = []
    for (const id of lootChecked) {
      const item = allItems.find(i => i.id === id)
      if (item && !selectedLoot.some(l => l.name === item.name)) {
        newLoot.push({ name: item.name, quantity: 1, category: item.category })
      }
    }
    setSelectedLoot(prev => [...prev, ...newLoot])
    setLootChecked(new Set())
  }

  const removeLootItem = (name) => setSelectedLoot(prev => prev.filter(l => l.name !== name))
  const updateLootQty = (name, qty) => setSelectedLoot(prev => prev.map(l => l.name === name ? { ...l, quantity: Math.max(1, qty) } : l))

  const totalSelected = selectedPlayers.size + selectedNpcs.size

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dsa-bg-medium flex-shrink-0">
        <h2 className="text-sm font-semibold text-dsa-gold flex items-center gap-2"><Swords className="w-4 h-4" /> Kampf vorbereiten</h2>
        <div className="flex items-center gap-2">
          <input value={battleName} onChange={e => setBattleName(e.target.value)} placeholder="Kampfname..."
            className="input-field text-xs w-40" />
          <button onClick={onCancel} className="text-dsa-parchment-dark hover:text-dsa-parchment"><X className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Tabs: Combatants | Loot */}
      <div className="flex border-b border-dsa-bg-medium flex-shrink-0">
        <button onClick={() => setActiveTab('combatants')}
          className={clsx('flex-1 py-2 text-xs font-semibold border-b-2 transition',
            activeTab === 'combatants' ? 'text-dsa-gold border-dsa-gold' : 'text-dsa-parchment-dark border-transparent')}>
          <Users className="w-3.5 h-3.5 inline mr-1" />Kaempfer ({selectedPlayers.size + selectedNpcs.size})
        </button>
        <button onClick={() => setActiveTab('loot')}
          className={clsx('flex-1 py-2 text-xs font-semibold border-b-2 transition',
            activeTab === 'loot' ? 'text-dsa-gold border-dsa-gold' : 'text-dsa-parchment-dark border-transparent')}>
          <Package className="w-3.5 h-3.5 inline mr-1" />Beute ({selectedLoot.length})
        </button>
      </div>

      {/* Combatants tab */}
      {activeTab === 'combatants' && <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Players */}
        <div className="flex-1 flex flex-col border-r border-dsa-bg-medium">
          <div className="px-3 py-2 border-b border-dsa-bg-medium flex items-center gap-2 flex-shrink-0">
            <Users className="w-3.5 h-3.5 text-green-400" />
            <span className="text-xs font-semibold text-green-400">Helden ({selectedPlayers.size})</span>
            <div className="flex-1" />
            <input value={playerSearch} onChange={e => setPlayerSearch(e.target.value)} placeholder="Suchen..."
              className="input-field text-[10px] w-32" />
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredPlayers.map(p => {
              const char = allChars.find(c => c.id === p.characterId) || p.character
              const cv = char?.combat_values || {}
              const dv = char?.derived_values || {}
              const primary = (cv.weapons || [])[0] || {}
              const selected = selectedPlayers.has(p.id)
              return (
                <button key={p.id} onClick={() => togglePlayer(p.id)}
                  className={clsx('w-full text-left px-3 py-2 rounded-sm border transition flex items-center gap-2',
                    selected ? 'bg-green-900/20 border-green-800/40' : 'bg-dsa-bg border-dsa-bg-medium hover:border-green-900/30'
                  )}>
                  <div className={clsx('w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center',
                    selected ? 'bg-green-600 border-green-500' : 'border-dsa-bg-medium')}>
                    {selected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-dsa-parchment">{char?.name || p.username}</div>
                    <div className="text-[9px] font-mono text-dsa-parchment-dark">
                      LeP {dv.LeP_max || '?'} · AT {primary.AT || '?'} · PA {primary.PA || '?'} · RS {cv.RS || 0} · {primary.name || 'Unbewaffnet'}
                    </div>
                  </div>
                  {!p.connected && <span className="text-[8px] text-red-400">offline</span>}
                </button>
              )
            })}
            {filteredPlayers.length === 0 && <p className="text-xs text-dsa-parchment-dark text-center py-4">Keine Spieler gefunden</p>}
          </div>
        </div>

        {/* RIGHT: NPCs / Creatures */}
        <div className="flex-1 flex flex-col">
          <div className="px-3 py-2 border-b border-dsa-bg-medium flex items-center gap-2 flex-shrink-0">
            <Skull className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs font-semibold text-red-400">Gegner ({selectedNpcs.size})</span>
            <div className="flex-1" />
            <input value={npcSearch} onChange={e => setNpcSearch(e.target.value)} placeholder="Suchen..."
              className="input-field text-[10px] w-32" />
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {/* Session pool creatures first */}
            {poolCreatures.length > 0 && !npcSearch && (
              <div className="mb-2">
                <span className="text-[9px] text-dsa-gold uppercase tracking-wider px-1">Session-Material</span>
                {poolCreatures.map(c => {
                  const cv = c.combat_values || {}
                  const atk = (c.attacks || [])[0] || {}
                  const selected = selectedNpcs.has(c.id)
                  return (
                    <button key={c.id} onClick={() => toggleNpc(c.id)}
                      className={clsx('w-full text-left px-3 py-2 rounded-sm border transition flex items-center gap-2 mt-1',
                        selected ? 'bg-red-900/20 border-red-800/40' : 'bg-dsa-bg border-dsa-gold/20 hover:border-red-900/30'
                      )}>
                      <div className={clsx('w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center',
                        selected ? 'bg-red-600 border-red-500' : 'border-dsa-bg-medium')}>
                        {selected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span>{getCreatureIcon(c.name, c.category)}</span>
                          <span className="text-xs font-semibold text-dsa-parchment">{c.name}</span>
                          <Star className="w-2.5 h-2.5 text-dsa-gold" />
                        </div>
                        <div className="text-[9px] font-mono text-dsa-parchment-dark">
                          LeP {cv.LeP || '?'} · AT {atk.AT || '?'} · RS {cv.RS || 0} · {atk.name || '?'} ({atk.damage || '?'})
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            {/* All creatures from databank */}
            {(!npcSearch ? <span className="text-[9px] text-dsa-parchment-dark uppercase tracking-wider px-1">Datenbank</span> : null)}
            {filteredNpcs.filter(c => !poolCreatureIds.has(c.id) || npcSearch).slice(0, 50).map(c => {
              const cv = c.combat_values || {}
              const atk = (c.attacks || [])[0] || {}
              const selected = selectedNpcs.has(c.id)
              return (
                <button key={c.id} onClick={() => toggleNpc(c.id)}
                  className={clsx('w-full text-left px-3 py-2 rounded-sm border transition flex items-center gap-2 mt-1',
                    selected ? 'bg-red-900/20 border-red-800/40' : 'bg-dsa-bg border-dsa-bg-medium hover:border-red-900/30'
                  )}>
                  <div className={clsx('w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center',
                    selected ? 'bg-red-600 border-red-500' : 'border-dsa-bg-medium')}>
                    {selected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span>{getCreatureIcon(c.name, c.category)}</span>
                      <span className="text-xs font-semibold text-dsa-parchment">{c.name}</span>
                      {c.category && <span className="text-[8px] text-dsa-parchment-dark bg-dsa-bg-medium rounded px-1">{c.category}</span>}
                    </div>
                    <div className="text-[9px] font-mono text-dsa-parchment-dark">
                      LeP {cv.LeP || '?'} · AT {atk.AT || '?'} · RS {cv.RS || 0} · INI {cv.INI_basis || '?'} · {atk.name || '?'} ({atk.damage || '?'})
                    </div>
                  </div>
                </button>
              )
            })}
            {filteredNpcs.length === 0 && <p className="text-xs text-dsa-parchment-dark text-center py-4">Keine Kreaturen gefunden</p>}
          </div>
        </div>
      </div>}

      {/* Loot tab */}
      {activeTab === 'loot' && (
        <div className="flex-1 flex overflow-hidden">
          {/* Left: selected loot */}
          <div className="w-72 flex-shrink-0 border-r border-dsa-bg-medium flex flex-col">
            <div className="px-3 py-2 border-b border-dsa-bg-medium flex-shrink-0">
              <span className="text-xs font-semibold text-dsa-gold"><Package className="w-3.5 h-3.5 inline mr-1" />Vorbereitete Beute ({selectedLoot.length})</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {selectedLoot.length === 0 && (
                <p className="text-[10px] text-dsa-parchment-dark text-center py-4">Noch keine Beute. Waehle rechts aus der Datenbank.</p>
              )}
              {selectedLoot.map((l, i) => (
                <div key={i} className="flex items-center gap-1 px-2 py-1.5 bg-dsa-bg rounded-sm border border-dsa-bg-medium">
                  <span className="text-sm">{getItemIcon(l.name, l.category)}</span>
                  <span className="text-xs text-dsa-parchment flex-1 truncate">{l.name}</span>
                  {l.fromCreature && <span className="text-[8px] text-dsa-parchment-dark bg-red-900/20 text-red-400 rounded px-1">{l.fromCreature}</span>}
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => updateLootQty(l.name, l.quantity - 1)} className="w-5 h-5 text-[10px] bg-dsa-bg-medium rounded hover:text-dsa-parchment text-dsa-parchment-dark">-</button>
                    <span className="text-[10px] font-mono text-dsa-gold w-5 text-center">{l.quantity}</span>
                    <button onClick={() => updateLootQty(l.name, l.quantity + 1)} className="w-5 h-5 text-[10px] bg-dsa-bg-medium rounded hover:text-dsa-parchment text-dsa-parchment-dark">+</button>
                  </div>
                  <button onClick={() => removeLootItem(l.name)} className="text-red-400/30 hover:text-red-400"><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          </div>

          {/* Right: item picker */}
          <div className="flex-1 flex flex-col">
            <div className="px-3 py-2 border-b border-dsa-bg-medium flex items-center gap-2 flex-shrink-0">
              <Search className="w-3 h-3 text-dsa-parchment-dark/40" />
              <input value={lootSearch} onChange={e => setLootSearch(e.target.value)} placeholder="Gegenstand suchen..."
                className="input-field text-[10px] flex-1" />
              {lootChecked.size > 0 && (
                <button onClick={addCheckedLoot}
                  className="px-2 py-1 text-[10px] bg-dsa-gold/20 text-dsa-gold rounded-sm hover:bg-dsa-gold/30 transition font-semibold">
                  <Plus className="w-3 h-3 inline mr-0.5" />{lootChecked.size} hinzufuegen
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {/* Session pool items first */}
              {poolItems.length > 0 && !lootSearch && (
                <>
                  <span className="text-[9px] text-dsa-gold uppercase tracking-wider px-1">Session-Material</span>
                  {poolItems.map(item => {
                    const checked = lootChecked.has(item.id)
                    const alreadyAdded = selectedLoot.some(l => l.name === item.name)
                    return (
                      <button key={item.id} onClick={() => !alreadyAdded && toggleLootItem(item)} disabled={alreadyAdded}
                        className={clsx('w-full text-left px-3 py-1.5 rounded-sm border transition flex items-center gap-2',
                          alreadyAdded ? 'opacity-40 cursor-default border-dsa-bg-medium' :
                          checked ? 'bg-dsa-gold/10 border-dsa-gold/30' : 'bg-dsa-bg border-dsa-bg-medium hover:border-dsa-gold/20')}>
                        <div className={clsx('w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center',
                          checked ? 'bg-dsa-gold border-dsa-gold' : 'border-dsa-bg-medium')}>
                          {(checked || alreadyAdded) && <Check className="w-3 h-3 text-dsa-bg" />}
                        </div>
                        <span className="text-sm">{getItemIcon(item.name, item.category)}</span>
                        <span className="text-xs text-dsa-parchment flex-1">{item.name}</span>
                        <Star className="w-2.5 h-2.5 text-dsa-gold" />
                      </button>
                    )
                  })}
                </>
              )}
              {/* All items from databank */}
              {!lootSearch && <span className="text-[9px] text-dsa-parchment-dark uppercase tracking-wider px-1 mt-2 block">Datenbank</span>}
              {filteredLootItems.filter(i => !poolItemIds.has(i.id) || lootSearch).slice(0, 60).map(item => {
                const checked = lootChecked.has(item.id)
                const alreadyAdded = selectedLoot.some(l => l.name === item.name)
                return (
                  <button key={item.id} onClick={() => !alreadyAdded && toggleLootItem(item)} disabled={alreadyAdded}
                    className={clsx('w-full text-left px-3 py-1.5 rounded-sm border transition flex items-center gap-2',
                      alreadyAdded ? 'opacity-40 cursor-default border-dsa-bg-medium' :
                      checked ? 'bg-dsa-gold/10 border-dsa-gold/30' : 'bg-dsa-bg border-dsa-bg-medium hover:border-dsa-gold/20')}>
                    <div className={clsx('w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center',
                      checked ? 'bg-dsa-gold border-dsa-gold' : 'border-dsa-bg-medium')}>
                      {(checked || alreadyAdded) && <Check className="w-3 h-3 text-dsa-bg" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm">{getItemIcon(item.name, item.category)}</span>
                      <span className="text-xs text-dsa-parchment">{item.name}</span>
                      {item.category && <span className="text-[8px] text-dsa-parchment-dark ml-1">{item.category}</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom: Start button */}
      <div className="px-4 py-3 border-t border-dsa-bg-medium flex-shrink-0 flex items-center gap-3">
        <span className="text-xs text-dsa-parchment-dark flex-1">
          {selectedPlayers.size} Helden · {selectedNpcs.size} Gegner
        </span>
        <button onClick={onCancel} className="btn-ghost text-xs">Abbrechen</button>
        <button
          onClick={startBattle}
          disabled={totalSelected < 2 || selectedPlayers.size === 0 || selectedNpcs.size === 0}
          className="px-6 py-2 bg-red-900/30 text-red-400 border border-red-800/30 rounded font-semibold text-sm hover:bg-red-900/40 disabled:opacity-30 transition flex items-center gap-2"
        >
          <Swords className="w-4 h-4" /> Kampf starten ({totalSelected})
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// NPCPanel — Sidebar panel showing session + databank NPCs
// ═══════════════════════════════════════════════════════════════

const HUMANOID_CATEGORIES = new Set(['humanoid'])

function NPCPanel({ creatureList, onSelect }) {
  const [tab, setTab] = useState('personen') // 'personen' | 'kreaturen'
  const [search, setSearch] = useState('')

  const pool = getSessionPool()
  const poolCreatures = pool.creatures || []
  const poolIds = new Set(poolCreatures.map(c => c.id))

  // Merge session pool + databank, dedupe
  const all = [...poolCreatures, ...creatureList.filter(c => !poolIds.has(c.id))]

  const personen = all.filter(c => HUMANOID_CATEGORIES.has(c.category))
  const kreaturen = all.filter(c => !HUMANOID_CATEGORIES.has(c.category))

  const list = tab === 'personen' ? personen : kreaturen
  const filtered = search
    ? list.filter(c => (c.name || '').toLowerCase().includes(search.toLowerCase()))
    : list

  return (
    <div className="flex flex-col border-t border-dsa-bg-medium" style={{ height: '45%', minHeight: 180 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-dsa-bg-medium flex-shrink-0">
        <h2 className="text-xs font-semibold text-dsa-gold flex items-center gap-1">
          <Skull className="w-3.5 h-3.5" /> NSCs
        </h2>
        <span className="text-[9px] text-dsa-parchment-dark">{filtered.length}</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-dsa-bg-medium flex-shrink-0">
        {[
          { id: 'personen', label: 'Personen', count: personen.length },
          { id: 'kreaturen', label: 'Kreaturen', count: kreaturen.length },
        ].map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setSearch('') }}
            className={clsx('flex-1 text-[10px] py-1.5 font-medium transition border-b-2',
              tab === t.id ? 'text-dsa-gold border-dsa-gold' : 'text-dsa-parchment-dark border-transparent hover:text-dsa-parchment')}>
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-2 py-1 flex-shrink-0">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen..."
          className="input-field text-[10px] w-full py-1" />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {filtered.length === 0 && (
          <p className="text-[10px] text-dsa-parchment-dark text-center py-4">Keine Eintraege</p>
        )}
        {filtered.map(c => {
          const cv = c.combat_values || {}
          const atk = (c.attacks || [])[0] || {}
          const isPool = poolIds.has(c.id)
          return (
            <button key={c.id} onClick={() => onSelect(c)}
              className="w-full text-left px-2 py-1.5 rounded-sm bg-dsa-bg border border-dsa-bg-medium hover:border-dsa-gold/30 transition group">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{getCreatureIcon(c.name, c.category)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-semibold text-dsa-parchment truncate">{c.name}</span>
                    {isPool && <Star className="w-2 h-2 text-dsa-gold flex-shrink-0" />}
                  </div>
                  <div className="text-[8px] font-mono text-dsa-parchment-dark">
                    {cv.LeP ? `LeP ${cv.LeP}` : ''}{atk.AT ? ` · AT ${atk.AT}` : ''}{cv.RS ? ` · RS ${cv.RS}` : ''}{atk.name ? ` · ${atk.name}` : ''}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// NPCDetailView — Full detail popup for a creature/NPC
// ═══════════════════════════════════════════════════════════════

function NPCDetailView({ creature, onClose }) {
  const c = creature
  const cv = c.combat_values || {}
  const attrs = c.attributes || {}
  const attacks = c.attacks || []

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{getCreatureIcon(c.name, c.category)}</span>
          <div>
            <h2 className="text-base font-display font-bold text-dsa-gold">{c.name}</h2>
            <p className="text-[10px] text-dsa-parchment-dark capitalize">{c.category || 'Unbekannt'}{c.size ? ` · ${c.size}` : ''}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-dsa-parchment-dark hover:text-dsa-parchment"><X className="w-4 h-4" /></button>
      </div>

      {/* Description */}
      {c.description && (
        <p className="text-xs text-dsa-parchment leading-relaxed">{c.description}</p>
      )}

      {/* Vitals */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'LeP', value: cv.LeP },
          { label: 'INI', value: cv.INI_basis },
          { label: 'GS', value: cv.GS },
          { label: 'AW', value: cv.AW },
          { label: 'RS', value: cv.RS },
          { label: 'SK', value: cv.SK },
          { label: 'ZK', value: cv.ZK },
          { label: 'SchiP', value: cv.Schip },
        ].filter(s => s.value != null).map(s => (
          <div key={s.label} className="bg-dsa-bg-card rounded-sm p-1.5 text-center border border-dsa-bg-medium">
            <div className="text-[9px] text-dsa-parchment-dark">{s.label}</div>
            <div className="text-sm font-bold text-dsa-parchment">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Attributes */}
      {Object.keys(attrs).length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider mb-1">Eigenschaften</h3>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(attrs).map(([k, v]) => (
              <span key={k} className="text-[10px] bg-dsa-bg-card border border-dsa-bg-medium rounded px-1.5 py-0.5 text-dsa-parchment font-mono">
                {k} {v}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Attacks */}
      {attacks.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider mb-1">Angriffe</h3>
          <div className="space-y-1">
            {attacks.map((atk, i) => (
              <div key={i} className="bg-dsa-bg-card border border-dsa-bg-medium rounded-sm px-3 py-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold text-dsa-parchment">{atk.name}</span>
                <span className="text-[10px] font-mono text-dsa-parchment-dark">
                  AT {atk.AT}{atk.PA ? ` · PA ${atk.PA}` : ''} · TP {atk.damage || atk.TP} · RW {atk.reach}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Special Rules */}
      {(c.special_rules || []).length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider mb-1">Sonderregeln</h3>
          <ul className="space-y-0.5">
            {c.special_rules.map((r, i) => (
              <li key={i} className="text-[10px] text-dsa-parchment pl-2 border-l-2 border-dsa-gold/20">
                {typeof r === 'string' ? r : `${r.name}: ${r.description || r.effect || ''}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Behavior / Tactics */}
      {(c.behavior || c.tactics) && (
        <div>
          <h3 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider mb-1">Verhalten</h3>
          {c.behavior && <p className="text-[10px] text-dsa-parchment">{c.behavior}</p>}
          {c.tactics && <p className="text-[10px] text-dsa-parchment-dark mt-0.5">{c.tactics}</p>}
        </div>
      )}

      {/* Immunities / Vulnerabilities */}
      {((c.immunities || []).length > 0 || (c.vulnerabilities || []).length > 0) && (
        <div className="flex gap-4">
          {(c.immunities || []).length > 0 && (
            <div>
              <h3 className="text-[10px] font-semibold text-green-400 mb-0.5">Immunitaeten</h3>
              <p className="text-[10px] text-dsa-parchment">{c.immunities.join(', ')}</p>
            </div>
          )}
          {(c.vulnerabilities || []).length > 0 && (
            <div>
              <h3 className="text-[10px] font-semibold text-red-400 mb-0.5">Schwaechen</h3>
              <p className="text-[10px] text-dsa-parchment">{c.vulnerabilities.join(', ')}</p>
            </div>
          )}
        </div>
      )}

      {/* Loot */}
      {(c.guaranteed_loot || []).length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider mb-1">Beute</h3>
          <div className="flex flex-wrap gap-1">
            {c.guaranteed_loot.map((l, i) => (
              <span key={i} className="text-[10px] bg-dsa-gold/10 text-dsa-gold rounded px-1.5 py-0.5">
                {typeof l === 'string' ? l : `${l.name}${l.quantity > 1 ? ` x${l.quantity}` : ''}`}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
