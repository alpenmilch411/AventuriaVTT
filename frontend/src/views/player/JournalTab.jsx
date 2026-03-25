import { useState } from 'react'
import { BookOpen, Target, Check, Eye, Clock } from 'lucide-react'
import useCampaignStore from '../../stores/campaignStore'
import Badge from '../../components/common/Badge'
import clsx from 'clsx'

export default function JournalTab() {
  const storeLore = useCampaignStore((s) => s.loreBook)
  const storeQuests = useCampaignStore((s) => s.quests)
  const [tab, setTab] = useState('quests')

  // Players only see revealed lore
  const lore = (storeLore || []).filter(e => e.revealed_to_players)
  const quests = storeQuests || []

  return (
    <div className="p-4 space-y-3">
      {/* Tabs */}
      <div className="flex border-b border-dsa-bg-medium">
        <button onClick={() => setTab('quests')}
          className={clsx('flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium transition border-b-2',
            tab === 'quests' ? 'text-dsa-gold border-dsa-gold' : 'text-dsa-parchment-dark border-transparent')}>
          <Target className="w-3.5 h-3.5" /> Quests ({quests.length})
        </button>
        <button onClick={() => setTab('lore')}
          className={clsx('flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium transition border-b-2',
            tab === 'lore' ? 'text-dsa-gold border-dsa-gold' : 'text-dsa-parchment-dark border-transparent')}>
          <BookOpen className="w-3.5 h-3.5" /> Wissen ({lore.length})
        </button>
      </div>

      {/* Quests */}
      {tab === 'quests' && (
        <div className="space-y-2">
          <div className="bg-dsa-gold/10 rounded-t px-3 py-2 flex items-center gap-2">
            <Target className="w-4 h-4 text-dsa-gold" />
            <span className="text-sm font-semibold text-dsa-gold">Aktive Quests</span>
          </div>
          {quests.length === 0 && <p className="text-xs text-dsa-parchment-dark text-center py-8">Noch keine Quests bekannt</p>}
          {quests.filter(q => q.status === 'active').map(q => (
            <div key={q.id} className="bg-dsa-bg-card border border-dsa-gold/20 rounded p-3">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-dsa-gold" />
                <h4 className="text-sm font-semibold text-dsa-gold">{q.title || q.name}</h4>
              </div>
              <p className="text-xs text-dsa-parchment leading-relaxed">{q.description}</p>
              {q.objectives && (
                <div className="mt-2 space-y-0.5">
                  {(Array.isArray(q.objectives) ? q.objectives : []).map((obj, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[10px]">
                      {(obj.completed || obj.done) ? <Check className="w-3 h-3 text-green-400" /> : <div className="w-3 h-3 rounded border border-dsa-bg-medium" />}
                      <span className={clsx((obj.completed || obj.done) ? 'text-green-400 line-through' : 'text-dsa-parchment')}>{obj.text || obj}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {quests.filter(q => q.status === 'completed').length > 0 && (
            <div className="pt-2 border-t border-dsa-bg-medium">
              <p className="text-[10px] text-dsa-parchment-dark uppercase tracking-wider mb-2">Abgeschlossen</p>
              {quests.filter(q => q.status === 'completed').map(q => (
                <div key={q.id} className="bg-dsa-bg-card border border-green-800/20 rounded p-2 mb-1 opacity-60">
                  <div className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-xs text-dsa-parchment">{q.title || q.name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lore */}
      {tab === 'lore' && (
        <div className="space-y-2">
          <div className="bg-blue-950/50 rounded-t px-3 py-2 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-blue-400">Wissen & Lore</span>
          </div>
          {lore.length === 0 && <p className="text-xs text-dsa-parchment-dark text-center py-8">Noch kein Wissen enthuellt</p>}
          {lore.map(entry => (
            <div key={entry.id} className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-3">
              <div className="flex items-center gap-2 mb-1">
                <Eye className="w-3.5 h-3.5 text-blue-400" />
                <h4 className="text-sm font-semibold text-dsa-parchment">{entry.title || entry.name}</h4>
                {entry.category && <Badge variant="default" size="sm">{entry.category}</Badge>}
              </div>
              <p className="text-xs text-dsa-parchment-dark leading-relaxed">{entry.content || entry.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
