import { useState } from 'react'
import {
  Dice5, Eye, Swords, CircleDot, Image, MessageSquare,
  Volume2, StickyNote, Clock, BookOpen, Send, Search
} from 'lucide-react'
import Modal from '../../components/common/Modal'
import useSessionStore from '../../stores/sessionStore'
import { getConditions } from '../../utils/safeData'
import clsx from 'clsx'

const ACTIONS = [
  { id: 'probe', icon: Dice5, label: 'Probe', color: 'text-dsa-gold' },
  { id: 'sinnesschaerfe', icon: Eye, label: 'Sinnesschaerfe', color: 'text-dsa-mana' },
  { id: 'combat', icon: Swords, label: 'Kampf', color: 'text-dsa-danger' },
  { id: 'spawn', icon: CircleDot, label: 'Spawn', color: 'text-dsa-success' },
  { id: 'handout', icon: Image, label: 'Handout', color: 'text-dsa-karma' },
  { id: 'whisper', icon: MessageSquare, label: 'Fluestern', color: 'text-dsa-mana' },
  { id: 'sound', icon: Volume2, label: 'Sound', color: 'text-dsa-warning' },
  { id: 'note', icon: StickyNote, label: 'Notiz', color: 'text-dsa-parchment' },
  { id: 'time', icon: Clock, label: 'Zeit', color: 'text-dsa-gold' },
  { id: 'rule', icon: BookOpen, label: 'Regel', color: 'text-dsa-parchment-dark' },
]

export default function QuickActions({ sendMessage, gmControls }) {
  const players = useSessionStore((s) => s.players)
  const [activeAction, setActiveAction] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [timeAdvance, setTimeAdvance] = useState('1')
  const [timeUnit, setTimeUnit] = useState('stunde')
  const [probePlayerId, setProbePlayerId] = useState('')
  const [probeTalent, setProbeTalent] = useState('')
  const [probeDifficulty, setProbeDifficulty] = useState(0)
  const [whisperPlayerId, setWhisperPlayerId] = useState('')
  const [whisperText, setWhisperText] = useState('')
  const [handoutText, setHandoutText] = useState('')
  const [ruleSearch, setRuleSearch] = useState('')

  const handleAction = (actionId) => {
    switch (actionId) {
      case 'sinnesschaerfe':
        gmControls.sendGroupProbe({
          type: 'talent',
          name: 'Sinnesschaerfe',
        })
        break
      case 'probe':
      case 'whisper':
      case 'spawn':
      case 'sound':
      case 'combat':
      case 'handout':
      case 'rule':
        setActiveAction(actionId)
        break
      case 'note':
        setActiveAction('note')
        break
      case 'time':
        setActiveAction('time')
        break
      default:
        break
    }
  }

  const handleSaveNote = () => {
    if (!noteText.trim()) return
    sendMessage?.({
      category: 'session',
      type: 'gm_note',
      payload: { text: noteText, timestamp: Date.now() },
    })
    setNoteText('')
    setActiveAction(null)
  }

  return (
    <>
      <div className="flex items-center gap-1 px-3 py-2 bg-dsa-bg-light border-t border-dsa-bg-medium flex-shrink-0 overflow-x-auto">
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            onClick={() => handleAction(action.id)}
            className={clsx(
              'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-sm transition-colors flex-shrink-0',
              'hover:bg-dsa-bg-medium active:bg-dsa-bg-card',
              action.color
            )}
            title={action.label}
          >
            <action.icon className="w-4 h-4" />
            <span className="text-[10px]">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Note Modal */}
      <Modal
        isOpen={activeAction === 'note'}
        onClose={() => setActiveAction(null)}
        title="SL-Notiz"
        footer={
          <>
            <button onClick={() => setActiveAction(null)} className="btn-ghost">Abbrechen</button>
            <button onClick={handleSaveNote} className="btn-primary">Speichern</button>
          </>
        }
      >
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          className="input-field h-32 resize-none"
          placeholder="Notiz eingeben..."
          autoFocus
        />
      </Modal>

      {/* Time Modal */}
      <Modal
        isOpen={activeAction === 'time'}
        onClose={() => setActiveAction(null)}
        title="Zeit vorstellen"
        footer={
          <>
            <button onClick={() => setActiveAction(null)} className="btn-ghost">Abbrechen</button>
            <button
              onClick={() => {
                gmControls.setWorldClock({
                  advance: parseInt(timeAdvance),
                  unit: timeUnit,
                })
                setActiveAction(null)
              }}
              className="btn-primary"
            >
              Vorstellen
            </button>
          </>
        }
      >
        <div className="flex gap-2">
          <input
            type="number"
            value={timeAdvance}
            onChange={(e) => setTimeAdvance(e.target.value)}
            className="input-field w-24"
            min="1"
          />
          <select
            value={timeUnit}
            onChange={(e) => setTimeUnit(e.target.value)}
            className="input-field flex-1"
          >
            <option value="minute">Minuten</option>
            <option value="stunde">Stunden</option>
            <option value="tag">Tage</option>
            <option value="woche">Wochen</option>
          </select>
        </div>
      </Modal>

      {/* Probe Modal */}
      <Modal
        isOpen={activeAction === 'probe'}
        onClose={() => { setActiveAction(null); setProbeTalent(''); setProbeDifficulty(0); setProbePlayerId('') }}
        title="Probe anfordern"
        footer={
          <>
            <button onClick={() => { setActiveAction(null); setProbeTalent(''); setProbeDifficulty(0); setProbePlayerId('') }} className="btn-ghost">Abbrechen</button>
            <button
              onClick={() => {
                if (probeTalent.trim() && probePlayerId) {
                  gmControls.sendProbe(probePlayerId, {
                    talent: probeTalent,
                    difficulty: parseInt(probeDifficulty) || 0,
                  })
                  setActiveAction(null)
                  setProbeTalent('')
                  setProbeDifficulty(0)
                  setProbePlayerId('')
                }
              }}
              className="btn-primary"
              disabled={!probeTalent.trim() || !probePlayerId}
            >
              <Dice5 className="w-4 h-4 inline mr-1" /> Probe anfordern
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-dsa-parchment-dark mb-1">Spieler</label>
            <select
              value={probePlayerId}
              onChange={(e) => setProbePlayerId(e.target.value)}
              className="input-field w-full"
            >
              <option value="">Spieler waehlen...</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>{p.character?.name || p.username || 'Spieler'}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-dsa-parchment-dark mb-1">Talent / Eigenschaft</label>
            <input
              type="text"
              value={probeTalent}
              onChange={(e) => setProbeTalent(e.target.value)}
              className="input-field w-full"
              placeholder="z.B. Sinnesschaerfe, Klettern, MU..."
            />
          </div>
          <div>
            <label className="block text-xs text-dsa-parchment-dark mb-1">Erschwernis / Erleichterung</label>
            <input
              type="number"
              value={probeDifficulty}
              onChange={(e) => setProbeDifficulty(e.target.value)}
              className="input-field w-24"
            />
            <span className="text-[10px] text-dsa-parchment-dark ml-2">Positiv = erschwert</span>
          </div>
        </div>
      </Modal>

      {/* Whisper Modal */}
      <Modal
        isOpen={activeAction === 'whisper'}
        onClose={() => { setActiveAction(null); setWhisperText(''); setWhisperPlayerId('') }}
        title="Fluestern"
        footer={
          <>
            <button onClick={() => { setActiveAction(null); setWhisperText(''); setWhisperPlayerId('') }} className="btn-ghost">Abbrechen</button>
            <button
              onClick={() => {
                if (whisperText.trim() && whisperPlayerId) {
                  gmControls.whisper(whisperPlayerId, whisperText)
                  setActiveAction(null)
                  setWhisperText('')
                  setWhisperPlayerId('')
                }
              }}
              className="btn-primary"
              disabled={!whisperText.trim() || !whisperPlayerId}
            >
              <Send className="w-4 h-4 inline mr-1" /> Senden
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-dsa-parchment-dark mb-1">Spieler</label>
            <select
              value={whisperPlayerId}
              onChange={(e) => setWhisperPlayerId(e.target.value)}
              className="input-field w-full"
            >
              <option value="">Spieler waehlen...</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>{p.character?.name || p.username || 'Spieler'}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-dsa-parchment-dark mb-1">Nachricht</label>
            <textarea
              value={whisperText}
              onChange={(e) => setWhisperText(e.target.value)}
              className="input-field h-24 resize-none w-full"
              placeholder="Nachricht eingeben..."
            />
          </div>
        </div>
      </Modal>

      {/* Spawn Modal */}
      <Modal
        isOpen={activeAction === 'spawn'}
        onClose={() => setActiveAction(null)}
        title="Kreatur spawnen"
        footer={
          <button onClick={() => setActiveAction(null)} className="btn-primary">Verstanden</button>
        }
      >
        <div className="text-center py-4">
          <CircleDot className="w-10 h-10 text-dsa-success mx-auto mb-3" />
          <p className="text-sm text-dsa-parchment">Kreatur aus dem Databank-Tab ziehen oder den Begegnungs-Baukasten verwenden.</p>
        </div>
      </Modal>

      {/* Sound Modal */}
      <Modal
        isOpen={activeAction === 'sound'}
        onClose={() => setActiveAction(null)}
        title="Soundboard"
        footer={
          <button onClick={() => setActiveAction(null)} className="btn-primary">Verstanden</button>
        }
      >
        <div className="text-center py-4">
          <Volume2 className="w-10 h-10 text-dsa-warning mx-auto mb-3" />
          <p className="text-sm text-dsa-parchment">Das Soundboard ist ueber die obere Leiste erreichbar (Lautsprecher-Symbol).</p>
        </div>
      </Modal>

      {/* Combat Modal */}
      <Modal
        isOpen={activeAction === 'combat'}
        onClose={() => setActiveAction(null)}
        title="Kampf starten"
        footer={
          <>
            <button onClick={() => setActiveAction(null)} className="btn-ghost">Abbrechen</button>
            <button
              onClick={() => {
                gmControls.startCombat(
                  players.map((p) => ({
                    id: p.id,
                    name: p.character?.name || p.username,
                    initiative: 0,
                    lep: (p.current_vitals || {}).lep ?? p.currentLeP ?? p.character?.derived_values?.LeP_max ?? 30,
                    lepMax: p.character?.derived_values?.LeP_max || 30,
                    isNPC: false,
                    conditions: getConditions(p),
                  }))
                )
                setActiveAction(null)
              }}
              className="btn-primary"
            >
              <Swords className="w-4 h-4 inline mr-1" /> Kampf starten
            </button>
          </>
        }
      >
        <div className="text-center py-4">
          <Swords className="w-10 h-10 text-dsa-danger mx-auto mb-3" />
          <p className="text-sm text-dsa-parchment mb-2">Kampf mit allen verbundenen Spielern starten?</p>
          <p className="text-xs text-dsa-parchment-dark">{players.length} Spieler werden in die Initiative-Reihenfolge aufgenommen.</p>
        </div>
      </Modal>

      {/* Handout Modal */}
      <Modal
        isOpen={activeAction === 'handout'}
        onClose={() => { setActiveAction(null); setHandoutText('') }}
        title="Handout senden"
        footer={
          <>
            <button onClick={() => { setActiveAction(null); setHandoutText('') }} className="btn-ghost">Abbrechen</button>
            <button
              onClick={() => {
                if (handoutText.trim()) {
                  sendMessage?.({
                    category: 'session',
                    type: 'handout',
                    payload: { content: handoutText, timestamp: Date.now() },
                  })
                  setActiveAction(null)
                  setHandoutText('')
                }
              }}
              className="btn-primary"
              disabled={!handoutText.trim()}
            >
              <Send className="w-4 h-4 inline mr-1" /> An Tisch senden
            </button>
          </>
        }
      >
        <textarea
          value={handoutText}
          onChange={(e) => setHandoutText(e.target.value)}
          className="input-field h-32 resize-none w-full"
          placeholder="Handout-Text eingeben..."
          autoFocus
        />
      </Modal>

      {/* Rule Search Modal */}
      <Modal
        isOpen={activeAction === 'rule'}
        onClose={() => { setActiveAction(null); setRuleSearch('') }}
        title="Regelsuche"
        footer={
          <button onClick={() => { setActiveAction(null); setRuleSearch('') }} className="btn-primary">Schliessen</button>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-dsa-parchment-dark" />
            <input
              type="text"
              value={ruleSearch}
              onChange={(e) => setRuleSearch(e.target.value)}
              className="input-field w-full"
              placeholder="Regel suchen..."
              autoFocus
            />
          </div>
          <div className="text-center py-6">
            <BookOpen className="w-10 h-10 text-dsa-parchment-dark mx-auto mb-3" />
            <p className="text-sm text-dsa-parchment-dark">Regelsuche (coming soon)</p>
            <p className="text-xs text-dsa-parchment-dark/60 mt-1">Die Volltextsuche in den DSA5-Regeln wird in einem zukuenftigen Update verfuegbar sein.</p>
          </div>
        </div>
      </Modal>
    </>
  )
}
