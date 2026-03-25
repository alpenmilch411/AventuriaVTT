/**
 * QuestSessionTab — GM view for quest tracking and session end/rewards.
 *
 * Three sections:
 * 1. Active Quests — track objectives, check off completions
 * 2. Add Quest — create new quests mid-session
 * 3. Session beenden — reward distribution and session close
 */
import { useState, useEffect } from 'react'
import {
  Target, Check, Plus, X, Star, Gift, Coins, ChevronDown, ChevronUp,
  AlertTriangle, Crown, Compass, User, Award, Clock, Scroll, Send,
  Swords, Shield
} from 'lucide-react'
import useSessionStore from '../../stores/sessionStore'
import useCampaignStore from '../../stores/campaignStore'
import useAuthStore from '../../stores/authStore'
import clsx from 'clsx'

const QUEST_TYPE_STYLE = {
  main: { label: 'Hauptquest', color: 'text-dsa-gold', bg: 'bg-dsa-gold/15 border-dsa-gold/30', icon: Crown },
  side: { label: 'Nebenquest', color: 'text-blue-400', bg: 'bg-blue-900/20 border-blue-800/30', icon: Compass },
  personal: { label: 'Persönlich', color: 'text-purple-400', bg: 'bg-purple-900/20 border-purple-800/30', icon: User },
}

const STATUS_STYLE = {
  active: { label: 'Aktiv', color: 'text-green-400', bg: 'bg-green-900/20' },
  completed: { label: 'Abgeschlossen', color: 'text-dsa-gold', bg: 'bg-dsa-gold/10' },
  failed: { label: 'Gescheitert', color: 'text-red-400', bg: 'bg-red-900/20' },
}

export default function QuestSessionTab({ campaignId, sessionId, sendMessage }) {
  const token = useAuthStore((s) => s.token)
  const players = useSessionStore((s) => s.players) || []

  const storeQuests = useCampaignStore((s) => s.quests)
  const quests = storeQuests || []
  const loading = false // quests come from store, always available

  const [expandedQuest, setExpandedQuest] = useState(null)
  const [showAddQuest, setShowAddQuest] = useState(false)
  const [showEndSession, setShowEndSession] = useState(false)
  const [newQuest, setNewQuest] = useState({ title: '', description: '', type: 'side', reward_description: '', objectives: [{ title: '', status: 'active' }], gm_notes: '' })
  const [apRewards, setApRewards] = useState({}) // character_id → { base, quest, bonus }
  const [itemRewards, setItemRewards] = useState({}) // character_id → [{ name, quantity }]
  const [endResult, setEndResult] = useState(null)

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  // Initialize AP rewards when entering end session
  useEffect(() => {
    if (showEndSession && players.length > 0) {
      const completedThisSession = quests.filter(q => q.status === 'completed' && q._justCompleted)
      const questAP = completedThisSession.reduce((sum, q) => sum + (q.type === 'main' ? 15 : 5), 0)
      const initial = {}
      for (const p of players) {
        if (p.characterId) {
          initial[p.characterId] = { base: 10, quest: questAP, bonus: 0 }
        }
      }
      setApRewards(initial)
    }
  }, [showEndSession])

  // ── Quest CRUD ──
  const updateObjective = async (questId, objIndex, newStatus, completedBy = null) => {
    const quest = quests.find(q => q.id === questId)
    if (!quest) return
    const objectives = [...(quest.objectives || [])]
    const updatedObj = { ...objectives[objIndex], status: newStatus }
    if (completedBy !== null) updatedObj.completed_by = completedBy
    if (newStatus === 'completed') updatedObj.completed_by = completedBy || ['all']
    if (newStatus === 'active' && !completedBy) updatedObj.completed_by = []
    objectives[objIndex] = updatedObj

    // Check if all objectives are completed → auto-complete quest
    const allDone = objectives.every(o => o.status === 'completed')

    const update = { objectives }
    if (allDone && quest.status === 'active') {
      update.status = 'completed'
    }

    const res = await fetch(`/api/campaigns/${campaignId}/quests/${questId}`, {
      method: 'PUT', headers, body: JSON.stringify(update),
    })
    if (res.ok) {
      const updated = await res.json()
      updated._justCompleted = allDone && quest.status === 'active'
      useCampaignStore.getState().setQuests(quests.map(q => q.id === questId ? updated : q))
      if (allDone && quest.status === 'active') {
        sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `✨ Quest abgeschlossen: ${quest.title}` } })
      }
    }
  }

  const toggleQuestStatus = async (questId, newStatus) => {
    const res = await fetch(`/api/campaigns/${campaignId}/quests/${questId}`, {
      method: 'PUT', headers, body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      const updated = await res.json()
      useCampaignStore.getState().setQuests(quests.map(q => q.id === questId ? updated : q))
    }
  }

  const createQuest = async () => {
    if (!newQuest.title.trim()) return
    const body = {
      ...newQuest,
      objectives: newQuest.objectives.filter(o => o.title.trim()).map(o => ({ ...o, status: o.status || 'active' })),
    }
    const res = await fetch(`/api/campaigns/${campaignId}/quests`, {
      method: 'POST', headers, body: JSON.stringify(body),
    })
    if (res.ok) {
      const created = await res.json()
      useCampaignStore.getState().addQuest(created)
      setNewQuest({ title: '', description: '', type: 'side', reward_description: '', objectives: [{ title: '', status: 'active' }], gm_notes: '' })
      setShowAddQuest(false)
      sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `📜 Neue Quest: ${created.title}` } })
    }
  }

  // ── Session End ──
  const handleEndSession = async () => {
    // 1. Award AP
    const awards = Object.entries(apRewards).map(([charId, ap]) => ({
      character_id: charId,
      amount: (ap.base || 0) + (ap.quest || 0) + (ap.bonus || 0),
      reason: `Session: ${ap.base} Basis + ${ap.quest} Quests + ${ap.bonus} Bonus`,
    })).filter(a => a.amount > 0)

    if (awards.length > 0 && sessionId) {
      await fetch(`/api/sessions/${sessionId}/ap-award`, {
        method: 'POST', headers, body: JSON.stringify({ awards }),
      })
    }

    // 2. Distribute item rewards
    for (const [charId, items] of Object.entries(itemRewards)) {
      if (!items || items.length === 0) continue
      // Fetch current inventory, add items, save
      const charRes = await fetch(`/api/characters/${charId}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!charRes.ok) continue
      const char = await charRes.json()
      const rawInv = char.basis_inventory || {}
      const invItems = Array.isArray(rawInv) ? rawInv : (rawInv.items || [])
      for (const reward of items) {
        const existing = invItems.find(i => i.name === reward.name)
        if (existing) {
          existing.quantity = (existing.quantity || 1) + (reward.quantity || 1)
        } else {
          invItems.push({ name: reward.name, quantity: reward.quantity || 1 })
        }
      }
      const newInv = Array.isArray(rawInv) ? invItems : { ...rawInv, items: invItems }
      await fetch(`/api/characters/${charId}`, {
        method: 'PUT', headers, body: JSON.stringify({ basis_inventory: newInv }),
      })
    }

    // 3. End session
    if (sessionId) {
      await fetch(`/api/sessions/${sessionId}/end`, { method: 'PUT', headers })
    }

    // 4. Notify players
    sendMessage?.({ type: 'session_end', payload: {
      message: 'Session beendet! Abenteuerpunkte wurden verteilt.',
      awards: awards.map(a => ({ character_id: a.character_id, amount: a.amount })),
    }})

    setEndResult({ success: true, awards })
  }

  const activeQuests = quests.filter(q => q.status === 'active')
  const completedQuests = quests.filter(q => q.status === 'completed')
  const totalAP = (charId) => {
    const ap = apRewards[charId]
    return ap ? (ap.base || 0) + (ap.quest || 0) + (ap.bonus || 0) : 0
  }

  if (loading) return <div className="p-4 text-dsa-parchment-dark text-sm">Quests werden geladen...</div>

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dsa-bg-medium bg-dsa-bg-card flex-shrink-0">
        <div className="flex items-center gap-2">
          <Scroll className="w-5 h-5 text-dsa-gold" />
          <h2 className="text-sm font-display font-bold text-dsa-gold uppercase tracking-wider">Quests & Session</h2>
          <span className="text-[10px] text-dsa-parchment-dark">{activeQuests.length} aktiv · {completedQuests.length} abgeschlossen</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAddQuest(true)} className="flex items-center gap-1 px-2 py-1 text-[10px] bg-dsa-gold/10 border border-dsa-gold/30 text-dsa-gold rounded-sm hover:bg-dsa-gold/20 transition">
            <Plus className="w-3 h-3" /> Neue Quest
          </button>
          <button onClick={() => setShowEndSession(true)} className="flex items-center gap-1 px-2 py-1 text-[10px] bg-red-900/20 border border-red-800/30 text-red-400 rounded-sm hover:bg-red-900/30 transition">
            <Clock className="w-3 h-3" /> Session beenden
          </button>
        </div>
      </div>

      {/* ── Quest List ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {/* Active quests */}
        {activeQuests.length > 0 && (
          <div>
            <div className="text-[10px] text-green-400 uppercase tracking-wider font-bold mb-1.5">Aktive Quests</div>
            {activeQuests.map(quest => (
              <QuestCard
                key={quest.id}
                quest={quest}
                expanded={expandedQuest === quest.id}
                onToggle={() => setExpandedQuest(expandedQuest === quest.id ? null : quest.id)}
                onUpdateObjective={(idx, status, completedBy) => updateObjective(quest.id, idx, status, completedBy)}
                onToggleStatus={(status) => toggleQuestStatus(quest.id, status)}
                players={players}
              />
            ))}
          </div>
        )}

        {/* Completed quests */}
        {completedQuests.length > 0 && (
          <div>
            <div className="text-[10px] text-dsa-gold uppercase tracking-wider font-bold mb-1.5 mt-3">Abgeschlossene Quests</div>
            {completedQuests.map(quest => (
              <QuestCard
                key={quest.id}
                quest={quest}
                expanded={expandedQuest === quest.id}
                onToggle={() => setExpandedQuest(expandedQuest === quest.id ? null : quest.id)}
                onUpdateObjective={() => {}}
                onToggleStatus={(status) => toggleQuestStatus(quest.id, status)}
                players={players}
              />
            ))}
          </div>
        )}

        {quests.length === 0 && (
          <div className="text-center py-8 text-dsa-parchment-dark text-sm">
            Keine Quests vorhanden. Erstelle eine neue Quest oder importiere ein Abenteuer.
          </div>
        )}
      </div>

      {/* ── Add Quest Modal ── */}
      {showAddQuest && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowAddQuest(false)}>
          <div className="bg-dsa-bg border border-dsa-bg-medium rounded shadow-2xl w-full max-w-lg animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-dsa-bg-medium bg-dsa-bg-card">
              <h3 className="text-sm font-display font-semibold text-dsa-gold">Neue Quest erstellen</h3>
              <button onClick={() => setShowAddQuest(false)} className="text-dsa-parchment-dark hover:text-dsa-parchment"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
              {/* Title */}
              <div>
                <label className="text-[10px] text-dsa-parchment-dark uppercase">Titel</label>
                <input value={newQuest.title} onChange={e => setNewQuest(p => ({ ...p, title: e.target.value }))}
                  className="input-field text-sm" placeholder="Name der Quest" autoFocus />
              </div>

              {/* Type */}
              <div>
                <label className="text-[10px] text-dsa-parchment-dark uppercase">Typ</label>
                <div className="flex gap-2 mt-1">
                  {Object.entries(QUEST_TYPE_STYLE).map(([type, style]) => (
                    <button key={type} onClick={() => setNewQuest(p => ({ ...p, type }))}
                      className={clsx('flex items-center gap-1 px-3 py-1.5 rounded-sm text-xs border transition',
                        newQuest.type === type ? style.bg + ' ' + style.color : 'bg-dsa-bg-card border-dsa-bg-medium text-dsa-parchment-dark')}>
                      <style.icon className="w-3 h-3" /> {style.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-[10px] text-dsa-parchment-dark uppercase">Beschreibung (für Spieler sichtbar)</label>
                <textarea value={newQuest.description} onChange={e => setNewQuest(p => ({ ...p, description: e.target.value }))}
                  className="input-field text-xs h-16 resize-none" placeholder="Was müssen die Helden tun?" />
              </div>

              {/* Objectives */}
              <div>
                <label className="text-[10px] text-dsa-parchment-dark uppercase">Ziele (Checkboxen für den Spielleiter)</label>
                <div className="space-y-1 mt-1">
                  {newQuest.objectives.map((obj, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={obj.title} onChange={e => {
                        const objs = [...newQuest.objectives]; objs[i] = { ...objs[i], title: e.target.value };
                        setNewQuest(p => ({ ...p, objectives: objs }))
                      }} className="input-field text-xs flex-1" placeholder={`Ziel ${i + 1}`} />
                      {newQuest.objectives.length > 1 && (
                        <button onClick={() => setNewQuest(p => ({ ...p, objectives: p.objectives.filter((_, j) => j !== i) }))}
                          className="text-red-400 hover:text-red-300"><X className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setNewQuest(p => ({ ...p, objectives: [...p.objectives, { title: '', status: 'active' }] }))}
                    className="text-[10px] text-dsa-gold hover:text-dsa-gold/80 flex items-center gap-1"><Plus className="w-3 h-3" /> Weiteres Ziel</button>
                </div>
              </div>

              {/* Reward */}
              <div>
                <label className="text-[10px] text-dsa-parchment-dark uppercase">Belohnung</label>
                <input value={newQuest.reward_description} onChange={e => setNewQuest(p => ({ ...p, reward_description: e.target.value }))}
                  className="input-field text-xs" placeholder="z.B. 50 Dukaten, Magisches Schwert, 10 AP" />
              </div>

              {/* GM Notes */}
              <div>
                <label className="text-[10px] text-dsa-parchment-dark uppercase">Spielleiter-Notizen (nur für dich)</label>
                <textarea value={newQuest.gm_notes} onChange={e => setNewQuest(p => ({ ...p, gm_notes: e.target.value }))}
                  className="input-field text-xs h-12 resize-none" placeholder="Hinweise, alternative Lösungswege, etc." />
              </div>
            </div>
            <div className="px-4 py-3 border-t border-dsa-bg-medium flex justify-end gap-2">
              <button onClick={() => setShowAddQuest(false)} className="px-3 py-1.5 text-xs text-dsa-parchment-dark border border-dsa-bg-medium rounded-sm hover:text-dsa-parchment transition">Abbrechen</button>
              <button onClick={createQuest} disabled={!newQuest.title.trim()}
                className="px-3 py-1.5 text-xs bg-dsa-gold/20 border border-dsa-gold/30 text-dsa-gold rounded-sm hover:bg-dsa-gold/30 transition disabled:opacity-30">
                <Plus className="w-3 h-3 inline mr-1" /> Quest erstellen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── End Session Modal ── */}
      {showEndSession && !endResult && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowEndSession(false)}>
          <div className="bg-dsa-bg border border-dsa-bg-medium rounded shadow-2xl w-full max-w-2xl animate-fade-in max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-dsa-bg-medium bg-dsa-bg-card flex-shrink-0">
              <h3 className="text-sm font-display font-semibold text-dsa-gold flex items-center gap-2">
                <Award className="w-5 h-5" /> Session beenden — Belohnungen verteilen
              </h3>
              <button onClick={() => setShowEndSession(false)} className="text-dsa-parchment-dark hover:text-dsa-parchment"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Completed quests summary */}
              {completedQuests.length > 0 && (
                <div>
                  <div className="text-[10px] text-dsa-gold uppercase tracking-wider font-bold mb-1">Abgeschlossene Quests</div>
                  <div className="space-y-1">
                    {completedQuests.map(q => {
                      const style = QUEST_TYPE_STYLE[q.type] || QUEST_TYPE_STYLE.side
                      return (
                        <div key={q.id} className="flex items-center gap-2 px-2 py-1 bg-dsa-bg-card border border-dsa-bg-medium rounded-sm">
                          <Check className="w-3.5 h-3.5 text-green-400" />
                          <span className="text-xs text-dsa-parchment flex-1">{q.title}</span>
                          <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-sm', style.bg, style.color)}>{style.label}</span>
                          {q.reward_description && <span className="text-[9px] text-dsa-parchment-dark">{q.reward_description}</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* AP Distribution */}
              <div>
                <div className="text-[10px] text-dsa-gold uppercase tracking-wider font-bold mb-2">Abenteuerpunkte verteilen</div>
                <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded-sm overflow-hidden">
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[9px] text-dsa-parchment-dark uppercase tracking-wider border-b border-dsa-bg-medium/50">
                    <div className="col-span-3">Charakter</div>
                    <div className="col-span-2 text-center">Basis</div>
                    <div className="col-span-2 text-center">Quests</div>
                    <div className="col-span-2 text-center">Bonus</div>
                    <div className="col-span-3 text-center">Gesamt</div>
                  </div>
                  {/* Rows */}
                  {players.filter(p => p.characterId).map(p => {
                    const ap = apRewards[p.characterId] || { base: 10, quest: 0, bonus: 0 }
                    const total = (ap.base || 0) + (ap.quest || 0) + (ap.bonus || 0)
                    const setAP = (field, val) => setApRewards(prev => ({
                      ...prev, [p.characterId]: { ...prev[p.characterId], [field]: parseInt(val) || 0 },
                    }))
                    return (
                      <div key={p.characterId} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-b border-dsa-bg-medium/30">
                        <div className="col-span-3">
                          <div className="text-xs text-dsa-parchment font-medium">{p.character?.name || p.username}</div>
                          <div className="text-[9px] text-dsa-parchment-dark">{p.character?.species} {p.character?.profession}</div>
                        </div>
                        <div className="col-span-2 text-center">
                          <input type="number" min="0" value={ap.base} onChange={e => setAP('base', e.target.value)}
                            className="w-14 text-center text-sm font-mono bg-dsa-bg border border-dsa-bg-medium rounded-sm px-1 py-0.5 text-dsa-parchment" />
                        </div>
                        <div className="col-span-2 text-center">
                          <input type="number" min="0" value={ap.quest} onChange={e => setAP('quest', e.target.value)}
                            className="w-14 text-center text-sm font-mono bg-dsa-bg border border-dsa-bg-medium rounded-sm px-1 py-0.5 text-dsa-parchment" />
                        </div>
                        <div className="col-span-2 text-center">
                          <input type="number" value={ap.bonus} onChange={e => setAP('bonus', e.target.value)}
                            className="w-14 text-center text-sm font-mono bg-dsa-bg border border-dsa-bg-medium rounded-sm px-1 py-0.5 text-dsa-parchment" />
                        </div>
                        <div className="col-span-3 text-center">
                          <span className="text-lg font-mono font-bold text-dsa-gold">{total}</span>
                          <span className="text-[9px] text-dsa-parchment-dark ml-1">AP</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[9px] text-dsa-parchment-dark mt-1">
                  Basis: Grundbelohnung für die Teilnahme. Quests: Bonus für abgeschlossene Aufträge. Bonus: Individuelle Anpassung (gutes Rollenspiel, clevere Ideen).
                </p>
              </div>

              {/* Warning */}
              <div className="bg-amber-900/15 border border-amber-800/25 rounded-sm p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-[10px] text-dsa-parchment-dark">
                  <strong className="text-amber-400">Achtung:</strong> Nach dem Beenden der Session werden die Abenteuerpunkte permanent auf die Charaktere gebucht.
                  Die Session wird archiviert und kann nicht erneut gestartet werden.
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-dsa-bg-medium flex justify-between items-center flex-shrink-0">
              <button onClick={() => setShowEndSession(false)} className="px-4 py-2 text-xs text-dsa-parchment-dark border border-dsa-bg-medium rounded-sm hover:text-dsa-parchment transition">
                Abbrechen
              </button>
              <button onClick={handleEndSession}
                className="px-4 py-2 text-xs bg-red-900/30 border border-red-800/40 text-red-400 rounded-sm hover:bg-red-900/50 transition font-bold flex items-center gap-2">
                <Award className="w-4 h-4" /> Session beenden & Belohnungen verteilen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── End Result ── */}
      {endResult && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-dsa-bg border border-dsa-gold/30 rounded shadow-2xl w-full max-w-md text-center p-8 animate-fade-in">
            <Award className="w-12 h-12 text-dsa-gold mx-auto mb-3" />
            <h2 className="text-xl font-display font-bold text-dsa-gold mb-2">Session beendet!</h2>
            <p className="text-sm text-dsa-parchment mb-4">Abenteuerpunkte wurden verteilt.</p>
            <div className="space-y-1 mb-4">
              {endResult.awards.map((a, i) => {
                const p = players.find(p => p.characterId === a.character_id)
                return (
                  <div key={i} className="flex justify-between text-xs bg-dsa-bg-card border border-dsa-bg-medium rounded-sm px-3 py-1.5">
                    <span className="text-dsa-parchment">{p?.character?.name || 'Charakter'}</span>
                    <span className="font-mono font-bold text-dsa-gold">+{a.amount} AP</span>
                  </div>
                )
              })}
            </div>
            <button onClick={() => { setShowEndSession(false); setEndResult(null) }}
              className="px-6 py-2 text-xs bg-dsa-gold/20 border border-dsa-gold/30 text-dsa-gold rounded-sm hover:bg-dsa-gold/30 transition">
              Schließen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Quest Card ──
function QuestCard({ quest, expanded, onToggle, onUpdateObjective, onToggleStatus, players }) {
  const style = QUEST_TYPE_STYLE[quest.type] || QUEST_TYPE_STYLE.side
  const statusStyle = STATUS_STYLE[quest.status] || STATUS_STYLE.active
  const TypeIcon = style.icon
  const objectives = quest.objectives || []
  const completedCount = objectives.filter(o => o.status === 'completed').length
  const assignedPlayer = quest.assigned_to ? players.find(p => p.characterId === quest.assigned_to) : null

  return (
    <div className={clsx('border rounded-sm overflow-hidden mb-1.5 transition', expanded ? 'border-dsa-gold/30 bg-dsa-bg-card' : 'border-dsa-bg-medium bg-dsa-bg-card/50')}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-dsa-bg-light/20 transition" onClick={onToggle}>
        <TypeIcon className={clsx('w-4 h-4 flex-shrink-0', style.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={clsx('text-xs font-medium truncate', quest.status === 'completed' ? 'text-dsa-parchment-dark line-through' : 'text-dsa-parchment')}>{quest.title}</span>
            <span className={clsx('text-[8px] px-1.5 py-0.5 rounded-sm flex-shrink-0', style.bg, style.color)}>{style.label}</span>
          </div>
          {assignedPlayer && <div className="text-[9px] text-purple-400">→ {assignedPlayer.character?.name || assignedPlayer.username}</div>}
        </div>
        {objectives.length > 0 && (
          <span className="text-[10px] font-mono text-dsa-parchment-dark flex-shrink-0">{completedCount}/{objectives.length}</span>
        )}
        {quest.status === 'completed' && <Check className="w-4 h-4 text-green-400 flex-shrink-0" />}
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-dsa-parchment-dark/40" /> : <ChevronDown className="w-3.5 h-3.5 text-dsa-parchment-dark/40" />}
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-dsa-bg-medium/50 space-y-2">
          {/* Description */}
          {quest.description && <p className="text-[11px] text-dsa-parchment/70 leading-relaxed pt-2">{quest.description}</p>}

          {/* Objectives as checkboxes — per player or all */}
          {objectives.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[9px] text-dsa-parchment-dark uppercase tracking-wider font-bold">Ziele</div>
              {objectives.map((obj, i) => {
                const completedBy = obj.completed_by || []
                const isAllDone = obj.status === 'completed'
                return (
                  <div key={i} className="bg-dsa-bg/30 border border-dsa-bg-medium/40 rounded-sm px-2 py-1.5">
                    {/* Main objective toggle (for all) */}
                    <label className="flex items-start gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={isAllDone}
                        onChange={() => onUpdateObjective(i, isAllDone ? 'active' : 'completed')}
                        className="mt-0.5 accent-dsa-gold"
                      />
                      <div className="flex-1">
                        <span className={clsx('text-xs', isAllDone ? 'text-dsa-parchment-dark line-through' : 'text-dsa-parchment group-hover:text-dsa-gold transition')}>{obj.title}</span>
                        {obj.description && <p className="text-[9px] text-dsa-parchment-dark/60">{obj.description}</p>}
                      </div>
                      <span className="text-[8px] text-dsa-parchment-dark/40 flex-shrink-0">Alle</span>
                    </label>
                    {/* Per-player completion (only for personal or when quest is assigned) */}
                    {!isAllDone && players.filter(p => p.characterId).length > 1 && (
                      <div className="flex flex-wrap gap-1 mt-1 ml-6">
                        {players.filter(p => p.characterId).map(p => {
                          const isDone = completedBy.includes(p.characterId)
                          return (
                            <button key={p.characterId}
                              onClick={() => {
                                const newBy = isDone ? completedBy.filter(id => id !== p.characterId) : [...completedBy, p.characterId]
                                onUpdateObjective(i, newBy.length === players.filter(pl => pl.characterId).length ? 'completed' : 'active', newBy)
                              }}
                              className={clsx('text-[8px] px-1.5 py-0.5 rounded-sm border transition',
                                isDone ? 'bg-green-900/30 border-green-800/30 text-green-400' : 'bg-dsa-bg border-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-parchment'
                              )}
                              title={isDone ? `${p.character?.name}: Erledigt` : `${p.character?.name}: Noch offen`}
                            >
                              {isDone && <Check className="w-2.5 h-2.5 inline mr-0.5" />}
                              {p.character?.name?.split(' ')[0] || p.username}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Reward */}
          {quest.reward_description && (
            <div className="flex items-start gap-1.5 bg-dsa-gold/5 border border-dsa-gold/15 rounded-sm px-2 py-1.5">
              <Gift className="w-3.5 h-3.5 text-dsa-gold flex-shrink-0 mt-0.5" />
              <span className="text-[10px] text-dsa-parchment">{quest.reward_description}</span>
            </div>
          )}

          {/* GM Notes */}
          {quest.gm_notes && (
            <div className="bg-dsa-bg/50 border border-dsa-bg-medium rounded-sm px-2 py-1.5">
              <div className="text-[9px] text-dsa-parchment-dark/50 uppercase mb-0.5">Spielleiter-Notizen</div>
              <p className="text-[10px] text-dsa-parchment-dark">{quest.gm_notes}</p>
            </div>
          )}

          {/* Status actions */}
          <div className="flex gap-1.5 pt-1">
            {quest.status === 'active' && (
              <>
                <button onClick={() => onToggleStatus('completed')} className="text-[9px] px-2 py-1 bg-green-900/20 border border-green-800/30 text-green-400 rounded-sm hover:bg-green-900/30 transition flex items-center gap-1">
                  <Check className="w-3 h-3" /> Als abgeschlossen markieren
                </button>
                <button onClick={() => onToggleStatus('failed')} className="text-[9px] px-2 py-1 bg-red-900/20 border border-red-800/30 text-red-400 rounded-sm hover:bg-red-900/30 transition flex items-center gap-1">
                  <X className="w-3 h-3" /> Gescheitert
                </button>
              </>
            )}
            {quest.status === 'completed' && (
              <button onClick={() => onToggleStatus('active')} className="text-[9px] px-2 py-1 bg-dsa-bg border border-dsa-bg-medium text-dsa-parchment-dark rounded-sm hover:text-dsa-parchment transition">
                Zurück auf aktiv setzen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
