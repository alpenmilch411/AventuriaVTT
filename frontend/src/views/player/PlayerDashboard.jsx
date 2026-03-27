import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  BookOpen, Backpack, Swords, Sparkles, User, Bell, Gift,
  X, Wifi, WifiOff, Star, Shield, Handshake, ArrowLeft
} from 'lucide-react'
import useWebSocket from '../../hooks/useWebSocket'
import useOffline from '../../hooks/useOffline'
import useSessionStore from '../../stores/sessionStore'
import useAuthStore from '../../stores/authStore'
import useCharacterStore from '../../stores/characterStore'
import useCombatStore from '../../stores/combatStore'
import useCampaignStore from '../../stores/campaignStore'
import useMapStore from '../../stores/mapStore'
import VitalsBar from '../../components/common/VitalsBar'
import useCombatValues from '../../hooks/useCombatValues'
import Badge from '../../components/common/Badge'
import CharacterSheet from './CharacterSheet'
import InventoryPanel from './InventoryPanel'
import SpellBook from './SpellBook'
import TalentList from './TalentList'
import CombatActions from './CombatActions'
import ArmoryTab from './ArmoryTab'
import TradeTab from './TradeTab'
// import SteigerungTab from './SteigerungTab' // kept as backup — AP spending between sessions
import ProbePopup from './ProbePopup'
import clsx from 'clsx'

const TABS = [
  { id: 'character', label: 'Charakter', icon: User },
  { id: 'armory', label: 'Ausrüstung', icon: Shield },
  { id: 'talents', label: 'Talente', icon: BookOpen },
  { id: 'inventory', label: 'Inventar', icon: Backpack },
  { id: 'spells', label: 'Magie', icon: Sparkles },
  { id: 'trade', label: 'Handel', icon: Handshake },
  { id: 'combat', label: 'Kampf', icon: Swords },
]

export default function PlayerDashboard() {
  const { sessionCode } = useParams()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const setSession = useSessionStore((s) => s.setSession)
  const lootReceived = useSessionStore((s) => s.lootReceived)
  const clearLootReceived = useSessionStore((s) => s.clearLootReceived)
  const notifications = useSessionStore((s) => s.notifications)
  const dismissNotification = useSessionStore((s) => s.dismissNotification)
  const myCharacter = useCharacterStore((s) => s.myCharacter)
  const getVitals = useCharacterStore((s) => s.getVitals)
  const combatActive = useCombatStore((s) => Object.keys(s.battles).length > 0)
  const pendingDiceRequest = useCombatStore((s) => s.pendingDiceRequest)
  const pendingDefense = useCombatStore((s) => s.pendingDefense)

  const [activeTab, setActiveTab] = useState('character')
  const [showNotifications, setShowNotifications] = useState(false)
  const [probeMinimized, setProbeMinimized] = useState(false)
  const [loadError, setLoadError] = useState(null)

  const { isOffline, OfflineBanner } = useOffline()

  const userId = user?.id

  useEffect(() => { if (!userId && token) fetchMe() }, [userId, token, fetchMe])

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!token && !userId) navigate('/')
  }, [token, userId, navigate])

  useEffect(() => {
    if (!userId || !token) return
    setSession({ sessionCode, isGM: false })
    loadCharacter()
  }, [sessionCode, token, userId])

  useEffect(() => {
    return () => {
      useSessionStore.getState().reset()
      useCombatStore.getState().reset()
      useCharacterStore.getState().reset()
      useCampaignStore.getState().reset()
      useMapStore.getState().reset()
    }
  }, [])

  // Auto-switch to combat tab when combat starts
  useEffect(() => {
    if (combatActive && activeTab !== 'combat') setActiveTab('combat')
  }, [combatActive])

  // Auto-switch to combat tab only for combat-related dice requests (attack, defense, damage, initiative)
  useEffect(() => {
    const isCombatRequest = pendingDiceRequest && ['attack', 'defense', 'damage', 'initiative'].includes(pendingDiceRequest.type)
    if ((pendingDefense || isCombatRequest) && activeTab !== 'combat') setActiveTab('combat')
  }, [pendingDefense, pendingDiceRequest])

  const loadCharacter = async () => {
    if (!token) return
    setLoadError(null)
    const headers = { Authorization: `Bearer ${token}` }
    try {
      // Get session by code
      const sessRes = await fetch(`/api/sessions/by-code/${sessionCode}`, { headers })
      if (!sessRes.ok) {
        const detail = await sessRes.json().catch(() => ({}))
        console.error('by-code failed:', sessRes.status, detail)
        setLoadError(sessRes.status === 403 ? 'Kein Zugriff auf diese Sitzung.' : 'Sitzung konnte nicht geladen werden.')
        return
      }
      const sessData = await sessRes.json()

      // Get players with full character data via session
      const playersRes = await fetch(`/api/sessions/${sessData.id}/players-detail`, { headers })
      if (!playersRes.ok) {
        const detail = await playersRes.json().catch(() => ({}))
        console.error('players-detail failed:', playersRes.status, detail)
        setLoadError('Spielerdaten konnten nicht geladen werden.')
        return
      }
      const playersData = await playersRes.json()
      const me = playersData.find(p => p.user_id === user?.id)
      if (me?.character) {
        const cv = me.current_vitals || {}
        const dv = me.character?.derived_values || {}
        useCharacterStore.getState().setMyCharacter({
          ...me.character,
          current_vitals: {
            lep: cv.lep ?? dv.LeP_max ?? 0,
            asp: cv.asp ?? dv.AsP_max ?? 0,
            kap: cv.kap ?? 0,
            schip: cv.schip ?? 3,
          },
        })
        useCombatStore.getState().setMyCharacterId(me.character.id)
      } else {
        console.warn('No character found for user', user?.id, 'in players list:', playersData.map(p => p.user_id))
        setLoadError('Kein Charakter in dieser Sitzung gefunden.')
      }
      // Store session info
      useSessionStore.getState().setSession({ sessionCode, sessionId: sessData.id, isGM: false })
      useSessionStore.getState().setPlayers(playersData.map(p => ({
        id: p.user_id, username: p.username, characterId: p.character_id,
        character: p.character, connected: p.connected,
      })))
    } catch (err) {
      console.error('Failed to load character:', err)
      setLoadError('Verbindungsfehler beim Laden des Charakters.')
    }
  }

  const { connected, sendMessage } = useWebSocket(sessionCode, user?.id, 'player')
  const vitals = getVitals()
  const cv = useCombatValues()
  const hasPendingDice = !!pendingDiceRequest
  const playerNotifications = notifications.filter(n => n.type !== 'system').slice(0, 10)
  const unreadCount = playerNotifications.length + (hasPendingDice ? 1 : 0)

  // Which tabs to show (hide spells if character has no AsP)
  const visibleTabs = TABS.filter(t => {
    if (t.id === 'spells' && (!vitals.aspMax || vitals.aspMax === 0) && (!vitals.kapMax || vitals.kapMax === 0)) return false
    return true
  })

  return (
    <div className="h-screen flex flex-col bg-dsa-bg overflow-hidden">
      <OfflineBanner />

      {/* ── HEADER: Character info + Vitals ── */}
      <header className="flex-shrink-0 bg-dsa-bg-light border-b border-dsa-bg-medium px-4 py-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/dashboard')}
              className="p-1 text-dsa-parchment-dark hover:text-dsa-gold transition-colors"
              title="Zurück zur Übersicht"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h1 className="text-sm font-display font-bold text-dsa-gold">{myCharacter?.name || (loadError ? 'Fehler' : 'Lade...')}</h1>
            {myCharacter?.species && <span className="text-[10px] text-dsa-parchment-dark">{myCharacter.species} {myCharacter.profession}</span>}
          </div>
          <div className="flex items-center gap-2">
            {connected ? <Wifi className="w-3.5 h-3.5 text-green-400" /> : <WifiOff className="w-3.5 h-3.5 text-red-400" />}
            <button onClick={() => setShowNotifications(!showNotifications)} className="relative p-1">
              <Bell className="w-4 h-4 text-dsa-parchment-dark" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] rounded-full flex items-center justify-center">{unreadCount}</span>
              )}
            </button>
          </div>
        </div>
        {myCharacter && cv && (() => {
          const inv = myCharacter.basis_inventory || []
          const invItems = Array.isArray(inv) ? inv : (inv.items || [])
          const purse = Array.isArray(inv) ? {} : (inv.purse || {})
          const kk = myCharacter.attributes?.KK || 10
          const totalWeight = invItems.reduce((s, i) => s + ((i.weight || 0) * (i.quantity || 1)), 0)
          const dv = myCharacter.derived_values || {}
          const moneyFromItems = {}
          invItems.forEach(i => {
            const n = (i.name || '').toLowerCase()
            if (n.includes('dukaten')) moneyFromItems.dukaten = (moneyFromItems.dukaten || 0) + (i.quantity || 1)
            if (n.includes('silber')) moneyFromItems.silber = (moneyFromItems.silber || 0) + (i.quantity || 1)
            if (n.includes('heller')) moneyFromItems.heller = (moneyFromItems.heller || 0) + (i.quantity || 1)
          })
          const money = {
            dukaten: (purse.dukaten || 0) + (moneyFromItems.dukaten || 0),
            silber: (purse.silber || 0) + (moneyFromItems.silber || 0),
            heller: (purse.heller || 0) + (moneyFromItems.heller || 0),
          }
          return (
            <VitalsBar
              portraitUrl={myCharacter.portrait_url || null}
              characterName={myCharacter.name || null}
              lep={vitals.lep} lepMax={vitals.lepMax}
              asp={vitals.asp} aspMax={vitals.aspMax}
              kap={vitals.kap} kapMax={vitals.kapMax}
              schip={vitals.schip} schipMax={vitals.schipMax}
              conditions={cv.conditions}
              characterId={myCharacter?.id}
              compact
              weight={totalWeight}
              weightMax={kk * 2}
              money={money}
              rs={cv.rs}
              be={cv.be}
              sk={dv.SK || 0}
              zk={dv.ZK || 0}
              ap={myCharacter.total_ap || null}
              apAvailable={myCharacter.available_ap || null}
              experienceGrade={myCharacter.experience_grade || null}
              attributes={myCharacter.attributes || null}
              combatAT={cv.at} baseAT={cv.baseAT}
              combatPA={cv.pa} basePA={cv.basePA}
              combatFK={cv.fk} baseFK={cv.baseFK}
              combatAW={cv.aw} baseAW={cv.baseAW}
              combatINI={cv.ini} baseINI={cv.baseINI}
              combatGS={cv.gs} baseGS={cv.baseGS}
              wundschwelle={cv.wundschwelle}
              schadensbonus={cv.schadensbonus}
              primaryMelee={cv.primaryMelee}
              primaryRanged={cv.primaryRanged}
              shieldPA={cv.shieldPA}
              lookupKTW={cv.lookupKTW}
              derivedValues={dv}
              rawBE={cv.computedBE}
              beReduction={cv.beRed}
            />
          )
        })()}
      </header>

      {/* ── ERROR BANNER ── */}
      {loadError && (
        <div className="flex-shrink-0 bg-red-900/30 border-b border-red-700/50 px-4 py-2 text-xs text-red-300">
          {loadError}
        </div>
      )}

      {/* ── TAB BAR ── */}
      <div className="flex border-b border-dsa-bg-medium bg-dsa-bg-light/50 flex-shrink-0">
        {visibleTabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          const isCombat = tab.id === 'combat' && combatActive
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex-1 flex items-center justify-center gap-1 py-2 text-xs font-semibold transition border-b-2',
                isActive ? 'text-dsa-gold border-dsa-gold' : 'text-dsa-parchment-dark border-transparent hover:text-dsa-parchment',
                isCombat && !isActive && 'text-red-400 animate-pulse'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── TAB CONTENT ── */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'character' && <CharacterSheet sendMessage={sendMessage} />}
        {activeTab === 'armory' && <ArmoryTab sendMessage={sendMessage} />}
        {activeTab === 'talents' && <TalentList sendMessage={sendMessage} />}
        {activeTab === 'inventory' && <InventoryPanel sendMessage={sendMessage} />}
        {activeTab === 'spells' && <SpellBook sendMessage={sendMessage} />}
        {activeTab === 'trade' && <TradeTab sendMessage={sendMessage} />}
        {activeTab === 'combat' && <CombatActions sendMessage={sendMessage} />}
      </div>

      {/* ── FLOATING: Combat indicator when on other tabs ── */}
      {combatActive && activeTab !== 'combat' && (
        <button
          onClick={() => setActiveTab('combat')}
          className="fixed bottom-20 right-4 z-30 bg-red-900/90 text-red-300 px-3 py-2 rounded-full shadow-lg animate-pulse flex items-center gap-2 text-xs font-semibold border border-red-700/50"
        >
          <Swords className="w-4 h-4" /> Kampf laeuft
        </button>
      )}

      {/* ── FLOATING: Dice Popup ── */}
      {pendingDiceRequest && !probeMinimized && (
        <ProbePopup
          request={pendingDiceRequest}
          character={myCharacter}
          sendMessage={sendMessage}
          onComplete={() => { useCombatStore.getState().clearPendingDiceRequest(); setProbeMinimized(false) }}
          onMinimize={() => setProbeMinimized(true)}
          canAbort={false}
        />
      )}


      {/* ── FLOATING: Loot Received ── */}
      {lootReceived && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-dsa-bg border border-dsa-gold/30 rounded shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in">
            <div className="bg-dsa-gold/10 px-5 py-4 text-center border-b border-dsa-gold/20">
              <Gift className="w-8 h-8 text-dsa-gold mx-auto mb-2" />
              <h3 className="text-lg font-display font-bold text-dsa-gold">Beute erhalten!</h3>
              {lootReceived.source_name && <p className="text-xs text-dsa-parchment-dark mt-1">Von: {lootReceived.source_name}</p>}
            </div>
            <div className="px-5 py-4 space-y-2">
              {(lootReceived.items || []).map((item, i) => (
                <div key={i} className="flex items-center justify-between bg-dsa-bg-card rounded-sm px-3 py-2 border border-dsa-bg-medium">
                  <span className="text-sm text-dsa-parchment">{item.name}</span>
                  <span className="text-sm font-mono text-dsa-gold">{item.quantity > 1 ? `${item.quantity}x` : ''}</span>
                </div>
              ))}
            </div>
            <div className="px-5 pb-4">
              <button onClick={clearLootReceived} className="w-full py-2 bg-dsa-gold/10 text-dsa-gold rounded-sm hover:bg-dsa-gold/20 transition-colors text-sm font-semibold">
                Verstanden
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FLOATING: Notifications ── */}
      {showNotifications && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowNotifications(false)}>
          <div className="bg-dsa-bg border border-dsa-bg-medium rounded shadow-2xl w-full max-w-md max-h-[60vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-dsa-bg-medium sticky top-0 bg-dsa-bg z-10">
              <h3 className="text-sm font-semibold text-dsa-gold">Benachrichtigungen</h3>
              <button onClick={() => setShowNotifications(false)}><X className="w-4 h-4 text-dsa-parchment-dark" /></button>
            </div>
            <div className="p-3 space-y-2">
              {/* Active probe */}
              {pendingDiceRequest && (
                <button onClick={() => { setProbeMinimized(false); setShowNotifications(false) }}
                  className="w-full bg-dsa-gold/10 border border-dsa-gold/30 rounded-sm p-3 text-left hover:bg-dsa-gold/20 transition">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🎲</span>
                    <div>
                      <p className="text-xs text-dsa-gold font-bold">Probe läuft — würfeln!</p>
                      <p className="text-[10px] text-dsa-parchment-dark">{pendingDiceRequest.label || pendingDiceRequest.talent_name || 'Talentprobe'}</p>
                    </div>
                  </div>
                </button>
              )}

              {/* Regular notifications */}
              {playerNotifications.map(n => (
                <div key={n.id} className="bg-dsa-bg-card rounded-sm p-3 border border-dsa-bg-medium">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] text-dsa-parchment-dark">{n.from}</span>
                      <p className="text-xs text-dsa-parchment mt-0.5">{n.text}</p>
                    </div>
                    <button onClick={() => dismissNotification(n.id)} className="text-dsa-parchment-dark/30 hover:text-dsa-parchment"><X className="w-3 h-3" /></button>
                  </div>
                </div>
              ))}

              {!pendingDiceRequest && playerNotifications.length === 0 && (
                <p className="text-xs text-dsa-parchment-dark/40 text-center py-4">Keine Benachrichtigungen</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
