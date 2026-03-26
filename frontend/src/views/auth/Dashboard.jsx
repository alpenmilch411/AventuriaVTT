import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LogOut, Shield, Scroll, User, Database, BookOpen, Clock
} from 'lucide-react'
import clsx from 'clsx'
import useAuthStore from '../../stores/authStore'
import SessionsTab from './SessionsTab'
import WikiTab from './WikiTab'
import DatenbankTab from './DatenbankTab'

const TABS = [
  { id: 'sessions', label: 'Sitzungen', icon: Scroll },
  { id: 'characters', label: 'Charaktere', icon: User },
  { id: 'database', label: 'Datenbank', icon: Database },
  { id: 'wiki', label: 'Wiki', icon: BookOpen },
]

function PlaceholderTab({ title }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-dsa-parchment-dark">
      <Clock className="w-12 h-12 mb-4 opacity-30" />
      <p className="text-lg font-display">{title}</p>
      <p className="text-sm mt-1">Kommt bald...</p>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const logout = useAuthStore((s) => s.logout)
  const fetchMe = useAuthStore((s) => s.fetchMe)

  const [activeTab, setActiveTab] = useState('sessions')

  const userId = user?.id

  useEffect(() => {
    if (!token) {
      navigate('/')
      return
    }
    if (!userId) {
      fetchMe()
    }
  }, [token, userId, navigate, fetchMe])

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'sessions':
        return <SessionsTab />
      case 'characters':
        return <PlaceholderTab title="Charaktere" />
      case 'database':
        return <DatenbankTab />
      case 'wiki':
        return <WikiTab />
      default:
        return <SessionsTab />
    }
  }

  return (
    <div className="min-h-screen bg-dsa-bg">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-dsa-bg-light border-b border-dsa-bg-medium">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-dsa-gold" />
            <h1 className="text-lg font-display font-bold text-dsa-gold">Aventuria VTT</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-dsa-parchment-dark hidden sm:block">
              {user?.username || 'Abenteurer'}
            </span>
            <button onClick={handleLogout} className="btn-ghost flex items-center gap-1 text-sm">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Abmelden</span>
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-5xl mx-auto px-4">
          <nav className="flex overflow-x-auto -mb-px">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    'py-2.5 px-4 flex items-center gap-2 text-sm font-medium transition-all whitespace-nowrap border-b-2',
                    isActive
                      ? 'text-dsa-gold border-dsa-gold bg-dsa-gold/5'
                      : 'text-dsa-parchment-dark border-transparent hover:text-dsa-parchment hover:bg-dsa-bg-card/50'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      {/* Tab content */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {renderTabContent()}
      </div>
    </div>
  )
}
