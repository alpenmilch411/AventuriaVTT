import { useState, useEffect } from 'react'
import {
  BookOpen, Scroll, Target, Clock, Plus, X, Check, ChevronDown, ChevronUp,
  Eye, EyeOff, Trash2, Star, Sparkles, Edit3
} from 'lucide-react'
import useAuthStore from '../../stores/authStore'
import Badge from '../../components/common/Badge'
import clsx from 'clsx'

const TABS = [
  { id: 'lore', label: 'Wissen', icon: BookOpen },
  { id: 'quests', label: 'Quests', icon: Target },
  { id: 'timeline', label: 'Chronik', icon: Clock },
]

export default function CampaignManager({ campaignId, onClose }) {
  const token = useAuthStore((s) => s.token)
  const [tab, setTab] = useState('lore')
  const [lore, setLore] = useState([])
  const [quests, setQuests] = useState([])
  const [timeline, setTimeline] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [editItem, setEditItem] = useState(null)

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  useEffect(() => { if (campaignId) loadAll() }, [campaignId])

  const loadAll = async () => {
    const [loreRes, questRes, timeRes] = await Promise.all([
      fetch(`/api/campaigns/${campaignId}/lore`, { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/campaigns/${campaignId}/quests`, { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/campaigns/${campaignId}/timeline`, { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
    ])
    setLore(Array.isArray(loreRes) ? loreRes : [])
    setQuests(Array.isArray(questRes) ? questRes : [])
    setTimeline(Array.isArray(timeRes) ? timeRes : [])
  }

  // ── LORE CRUD ──
  const createLore = async (data) => {
    await fetch(`/api/campaigns/${campaignId}/lore`, { method: 'POST', headers, body: JSON.stringify(data) })
    loadAll(); setShowCreate(false)
  }
  const updateLore = async (id, data) => {
    await fetch(`/api/campaigns/${campaignId}/lore/${id}`, { method: 'PUT', headers, body: JSON.stringify(data) })
    loadAll(); setEditItem(null)
  }
  const revealLore = async (id) => {
    await fetch(`/api/campaigns/${campaignId}/lore/${id}/reveal`, { method: 'POST', headers })
    loadAll()
  }

  // ── QUEST CRUD ──
  const createQuest = async (data) => {
    await fetch(`/api/campaigns/${campaignId}/quests`, { method: 'POST', headers, body: JSON.stringify(data) })
    loadAll(); setShowCreate(false)
  }
  const updateQuest = async (id, data) => {
    await fetch(`/api/campaigns/${campaignId}/quests/${id}`, { method: 'PUT', headers, body: JSON.stringify(data) })
    loadAll(); setEditItem(null)
  }

  // ── TIMELINE ──
  const createTimelineEntry = async (data) => {
    await fetch(`/api/campaigns/${campaignId}/timeline`, { method: 'POST', headers, body: JSON.stringify(data) })
    loadAll(); setShowCreate(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-dsa-bg border border-dsa-bg-medium rounded shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-dsa-bg-medium">
          <h2 className="text-sm font-display font-bold text-dsa-gold">Kampagnen-Verwaltung</h2>
          <button onClick={onClose} className="text-dsa-parchment-dark hover:text-dsa-parchment"><X className="w-4 h-4" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-dsa-bg-medium">
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setShowCreate(false); setEditItem(null) }}
              className={clsx('flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition border-b-2',
                tab === t.id ? 'text-dsa-gold border-dsa-gold' : 'text-dsa-parchment-dark border-transparent hover:text-dsa-parchment')}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* ── LORE TAB ── */}
          {tab === 'lore' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-dsa-parchment-dark">{lore.length} Eintraege</p>
                <button onClick={() => setShowCreate(true)} className="text-xs px-2 py-1 bg-dsa-gold/10 text-dsa-gold rounded-sm hover:bg-dsa-gold/20 transition flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Neues Wissen
                </button>
              </div>

              {showCreate && (
                <LoreForm onSubmit={createLore} onCancel={() => setShowCreate(false)} />
              )}

              {lore.map(entry => (
                <div key={entry.id} className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-3">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <h4 className="text-sm font-semibold text-dsa-parchment">{entry.title || entry.name}</h4>
                      <div className="flex gap-1 mt-0.5">
                        {entry.category && <Badge variant="default" size="sm">{entry.category}</Badge>}
                        {entry.revealed_to_players && <Badge variant="success" size="sm"><Eye className="w-2.5 h-2.5 inline" /> Enthüllt</Badge>}
                        {!entry.revealed_to_players && <Badge variant="warning" size="sm"><EyeOff className="w-2.5 h-2.5 inline" /> Verborgen</Badge>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {!entry.revealed_to_players && (
                        <button onClick={() => revealLore(entry.id)} className="text-[9px] px-2 py-1 bg-green-900/20 text-green-400 rounded hover:bg-green-900/30 transition">
                          <Eye className="w-3 h-3 inline mr-0.5" /> Enthüllen
                        </button>
                      )}
                      <button onClick={() => setEditItem(entry)} className="p-1 text-dsa-parchment-dark hover:text-dsa-parchment"><Edit3 className="w-3 h-3" /></button>
                    </div>
                  </div>
                  <p className="text-xs text-dsa-parchment-dark leading-relaxed">{entry.content || entry.description}</p>
                </div>
              ))}
              {lore.length === 0 && !showCreate && <p className="text-xs text-dsa-parchment-dark/50 text-center py-8">Noch kein Wissen erstellt</p>}
            </div>
          )}

          {/* ── QUESTS TAB ── */}
          {tab === 'quests' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-dsa-parchment-dark">{quests.length} Quests</p>
                <button onClick={() => setShowCreate(true)} className="text-xs px-2 py-1 bg-dsa-gold/10 text-dsa-gold rounded-sm hover:bg-dsa-gold/20 transition flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Neuer Quest
                </button>
              </div>

              {showCreate && (
                <QuestForm onSubmit={createQuest} onCancel={() => setShowCreate(false)} />
              )}

              {quests.map(q => (
                <div key={q.id} className={clsx('bg-dsa-bg-card border rounded p-3',
                  q.status === 'completed' ? 'border-green-800/30' : q.status === 'failed' ? 'border-red-800/30' : 'border-dsa-bg-medium')}>
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <h4 className="text-sm font-semibold text-dsa-parchment flex items-center gap-1">
                        {q.status === 'completed' && <Check className="w-3.5 h-3.5 text-green-400" />}
                        {q.status === 'active' && <Target className="w-3.5 h-3.5 text-dsa-gold" />}
                        {q.title || q.name}
                      </h4>
                      <Badge variant={q.status === 'completed' ? 'success' : q.status === 'failed' ? 'danger' : 'warning'} size="sm">{q.status || 'aktiv'}</Badge>
                    </div>
                    <div className="flex gap-1">
                      {q.status !== 'completed' && (
                        <button onClick={() => updateQuest(q.id, { ...q, status: 'completed' })} className="text-[9px] px-2 py-1 bg-green-900/20 text-green-400 rounded hover:bg-green-900/30 transition">
                          <Check className="w-3 h-3 inline" /> Abschliessen
                        </button>
                      )}
                      <button onClick={() => setEditItem(q)} className="p-1 text-dsa-parchment-dark hover:text-dsa-parchment"><Edit3 className="w-3 h-3" /></button>
                    </div>
                  </div>
                  <p className="text-xs text-dsa-parchment-dark leading-relaxed">{q.description}</p>
                  {q.objectives && (
                    <div className="mt-2 space-y-0.5">
                      {(Array.isArray(q.objectives) ? q.objectives : []).map((obj, i) => (
                        <div key={i} className="flex items-center gap-1 text-[10px]">
                          <span className={obj.completed ? 'text-green-400' : 'text-dsa-parchment-dark'}>
                            {obj.completed ? '☑' : '☐'} {obj.text || obj}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {quests.length === 0 && !showCreate && <p className="text-xs text-dsa-parchment-dark/50 text-center py-8">Noch keine Quests</p>}
            </div>
          )}

          {/* ── TIMELINE TAB ── */}
          {tab === 'timeline' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-dsa-parchment-dark">{timeline.length} Ereignisse</p>
                <button onClick={() => setShowCreate(true)} className="text-xs px-2 py-1 bg-dsa-gold/10 text-dsa-gold rounded-sm hover:bg-dsa-gold/20 transition flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Neues Ereignis
                </button>
              </div>

              {showCreate && (
                <TimelineForm onSubmit={createTimelineEntry} onCancel={() => setShowCreate(false)} />
              )}

              <div className="border-l-2 border-dsa-gold/20 ml-3 space-y-3">
                {timeline.map(e => (
                  <div key={e.id} className="relative pl-5">
                    <div className="absolute left-0 top-1 w-2.5 h-2.5 rounded-full bg-dsa-gold/40 -translate-x-[7px]" />
                    <div className="text-[9px] text-dsa-gold font-mono">{e.date || e.in_game_date || '—'}</div>
                    <h4 className="text-xs font-semibold text-dsa-parchment">{e.title || e.event}</h4>
                    <p className="text-[10px] text-dsa-parchment-dark">{e.description}</p>
                  </div>
                ))}
              </div>
              {timeline.length === 0 && !showCreate && <p className="text-xs text-dsa-parchment-dark/50 text-center py-8">Noch keine Chronik-Eintraege</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Forms ──

function LoreForm({ onSubmit, onCancel, initial }) {
  const [title, setTitle] = useState(initial?.title || initial?.name || '')
  const [content, setContent] = useState(initial?.content || initial?.description || '')
  const [category, setCategory] = useState(initial?.category || 'location')
  const cats = ['location', 'person', 'faction', 'item', 'event', 'legend', 'other']
  return (
    <div className="bg-dsa-bg border border-dsa-gold/20 rounded p-3 space-y-2">
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titel..." className="input-field text-xs w-full" autoFocus />
      <div className="flex gap-1 flex-wrap">
        {cats.map(c => (
          <button key={c} onClick={() => setCategory(c)}
            className={clsx('text-[9px] px-2 py-0.5 rounded transition capitalize',
              category === c ? 'bg-dsa-gold/20 text-dsa-gold' : 'bg-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-parchment')}>
            {c}
          </button>
        ))}
      </div>
      <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Inhalt..." rows={4} className="input-field text-xs w-full resize-none" />
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="btn-ghost text-xs">Abbrechen</button>
        <button onClick={() => onSubmit({ title, content, category })} disabled={!title.trim()} className="btn-primary text-xs">Speichern</button>
      </div>
    </div>
  )
}

function QuestForm({ onSubmit, onCancel, initial }) {
  const [title, setTitle] = useState(initial?.title || initial?.name || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [status, setStatus] = useState(initial?.status || 'active')
  return (
    <div className="bg-dsa-bg border border-dsa-gold/20 rounded p-3 space-y-2">
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Quest-Name..." className="input-field text-xs w-full" autoFocus />
      <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Beschreibung..." rows={3} className="input-field text-xs w-full resize-none" />
      <div className="flex gap-1">
        {['active', 'completed', 'failed'].map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={clsx('text-[9px] px-2 py-0.5 rounded transition capitalize',
              status === s ? (s === 'active' ? 'bg-dsa-gold/20 text-dsa-gold' : s === 'completed' ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400') : 'bg-dsa-bg-medium text-dsa-parchment-dark')}>
            {s === 'active' ? 'Aktiv' : s === 'completed' ? 'Abgeschlossen' : 'Gescheitert'}
          </button>
        ))}
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="btn-ghost text-xs">Abbrechen</button>
        <button onClick={() => onSubmit({ title, description, status })} disabled={!title.trim()} className="btn-primary text-xs">Speichern</button>
      </div>
    </div>
  )
}

function TimelineForm({ onSubmit, onCancel }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  return (
    <div className="bg-dsa-bg border border-dsa-gold/20 rounded p-3 space-y-2">
      <div className="flex gap-2">
        <input value={date} onChange={e => setDate(e.target.value)} placeholder="Datum (z.B. 3. Praios 1040)" className="input-field text-xs flex-1" />
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ereignis..." className="input-field text-xs flex-1" autoFocus />
      </div>
      <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Details..." rows={2} className="input-field text-xs w-full resize-none" />
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="btn-ghost text-xs">Abbrechen</button>
        <button onClick={() => onSubmit({ title, description, in_game_date: date })} disabled={!title.trim()} className="btn-primary text-xs">Speichern</button>
      </div>
    </div>
  )
}
