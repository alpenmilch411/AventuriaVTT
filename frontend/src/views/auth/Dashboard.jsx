import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  User, Users, BookOpen, Plus, LogIn, LogOut, Upload,
  Shield, Swords, ChevronRight, Scroll, AlertCircle,
  Check, Crown
} from 'lucide-react'
import useAuthStore from '../../stores/authStore'
import Modal from '../../components/common/Modal'
import Badge from '../../components/common/Badge'
import CampaignManager from './CampaignManager'

export default function Dashboard() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const logout = useAuthStore((s) => s.logout)
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const getAuthHeaders = useAuthStore((s) => s.getAuthHeaders)

  const [showJoinSession, setShowJoinSession] = useState(false)
  const [showJoinCampaign, setShowJoinCampaign] = useState(false)
  const [showNewCampaign, setShowNewCampaign] = useState(false)
  const [manageCampaignId, setManageCampaignId] = useState(null)
  const [sessionCode, setSessionCode] = useState('')
  const [campaignCode, setCampaignCode] = useState('')
  const [newCampaignName, setNewCampaignName] = useState('')
  const [newCampaignDesc, setNewCampaignDesc] = useState('')
  const [joinError, setJoinError] = useState('')
  const [joinSuccess, setJoinSuccess] = useState('')

  const [characters, setCharacters] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const headers = { Authorization: `Bearer ${token}` }

      const [charRes, campRes] = await Promise.all([
        fetch('/api/characters', { headers }),
        fetch('/api/campaigns', { headers }),
      ])

      if (charRes.ok) {
        const charData = await charRes.json()
        setCharacters(Array.isArray(charData) ? charData : [])
      }
      if (campRes.ok) {
        const campData = await campRes.json()
        setCampaigns(Array.isArray(campData) ? campData : [])
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err)
    }
    setLoading(false)
  }, [token])

  const userId = user?.id

  useEffect(() => {
    if (!token) {
      navigate('/')
      return
    }
    if (!userId) {
      fetchMe()
      return
    }
    fetchData()
  }, [token, userId, navigate, fetchMe, fetchData])

  const handleJoinSession = () => {
    const code = sessionCode.trim().toUpperCase()
    if (!code) return
    // Determine if user is GM or player for this session
    // For now, navigate to player view — GM can use /gm/:code directly
    navigate(`/play/${code}`)
    setShowJoinSession(false)
  }

  const handleJoinCampaign = async () => {
    const code = campaignCode.trim().toUpperCase()
    if (!code) return
    setJoinError('')
    setJoinSuccess('')
    try {
      const res = await fetch('/api/campaigns/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ campaign_code: code }),
      })
      if (!res.ok) {
        const data = await res.json()
        setJoinError(data.detail || 'Beitreten fehlgeschlagen')
        return
      }
      setJoinSuccess('Erfolgreich beigetreten!')
      setCampaignCode('')
      fetchData()
      setTimeout(() => {
        setShowJoinCampaign(false)
        setJoinSuccess('')
      }, 1500)
    } catch (err) {
      setJoinError('Netzwerkfehler')
    }
  }

  const handleCreateCampaign = async () => {
    if (!newCampaignName.trim()) return
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newCampaignName.trim(),
          description: newCampaignDesc.trim(),
        }),
      })
      if (res.ok) {
        setShowNewCampaign(false)
        setNewCampaignName('')
        setNewCampaignDesc('')
        fetchData()
      }
    } catch (err) {
      console.error('Failed to create campaign:', err)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const isGM = (campaign) => campaign.gm_user_id === user?.id

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
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            onClick={() => setShowJoinSession(true)}
            className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4 text-center hover:border-dsa-gold/30 transition-colors"
          >
            <LogIn className="w-6 h-6 text-dsa-gold mx-auto mb-2" />
            <span className="text-sm text-dsa-parchment">Session beitreten</span>
          </button>
          <button
            onClick={() => setShowJoinCampaign(true)}
            className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4 text-center hover:border-dsa-gold/30 transition-colors"
          >
            <BookOpen className="w-6 h-6 text-dsa-gold mx-auto mb-2" />
            <span className="text-sm text-dsa-parchment">Kampagne beitreten</span>
          </button>
          <button
            onClick={() => setShowNewCampaign(true)}
            className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4 text-center hover:border-dsa-gold/30 transition-colors"
          >
            <Plus className="w-6 h-6 text-dsa-gold mx-auto mb-2" />
            <span className="text-sm text-dsa-parchment">Neue Kampagne</span>
          </button>
          <button className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4 text-center hover:border-dsa-gold/30 transition-colors">
            <Upload className="w-6 h-6 text-dsa-gold mx-auto mb-2" />
            <span className="text-sm text-dsa-parchment">Charakter importieren</span>
          </button>
        </div>

        {/* My Characters */}
        <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-dsa-bg-medium">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-dsa-gold" />
              <h2 className="font-semibold text-dsa-parchment">Meine Charaktere</h2>
            </div>
          </div>
          <div className="p-3 space-y-2">
            {loading ? (
              <div className="text-center py-6 text-dsa-parchment-dark text-sm">Laden...</div>
            ) : characters.length === 0 ? (
              <div className="text-center py-6 text-dsa-parchment-dark text-sm">
                Noch keine Charaktere. Erstelle oder importiere einen!
              </div>
            ) : (
              characters.map((char) => (
                <Link
                  to={`/character/${char.id}`}
                  key={char.id}
                  className="flex items-center justify-between p-3 bg-dsa-bg rounded-sm border border-dsa-bg-medium hover:border-dsa-gold/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-dsa-bg-medium rounded-full flex items-center justify-center">
                      <Swords className="w-5 h-5 text-dsa-parchment-dark" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-dsa-parchment">{char.name}</div>
                      <div className="text-xs text-dsa-parchment-dark">
                        {char.species} | {char.profession} | {char.total_ap || 0} AP
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={char.status === 'active' ? 'success' : char.status === 'dead' ? 'danger' : 'default'}
                      size="sm"
                    >
                      {char.status === 'active' ? 'Aktiv' : char.status === 'dead' ? 'Tot' : char.status === 'resting' ? 'Ruht' : 'Erstellt'}
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-dsa-parchment-dark" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* My Campaigns */}
        <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-dsa-bg-medium">
            <div className="flex items-center gap-2">
              <Scroll className="w-4 h-4 text-dsa-gold" />
              <h2 className="font-semibold text-dsa-parchment">Meine Kampagnen</h2>
            </div>
          </div>
          <div className="p-3 space-y-2">
            {loading ? (
              <div className="text-center py-6 text-dsa-parchment-dark text-sm">Laden...</div>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-6 text-dsa-parchment-dark text-sm">
                Noch keine Kampagnen. Erstelle eine oder tritt einer bei!
              </div>
            ) : (
              campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="flex items-center justify-between p-3 bg-dsa-bg rounded-sm border border-dsa-bg-medium hover:border-dsa-gold/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-dsa-bg-medium rounded-full flex items-center justify-center">
                      <BookOpen className="w-5 h-5 text-dsa-parchment-dark" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-dsa-parchment">{campaign.name}</div>
                      <div className="text-xs text-dsa-parchment-dark">
                        {isGM(campaign) ? 'Spielleiter' : 'Spieler'}
                        {campaign.campaign_code && (
                          <span className="ml-2 font-mono text-dsa-gold/60">
                            Code: {campaign.campaign_code}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={isGM(campaign) ? 'gold' : 'mana'} size="sm">
                      {isGM(campaign) ? <><Crown className="w-3 h-3 inline mr-1" />SL</> : 'Spieler'}
                    </Badge>
                    {isGM(campaign) && (
                      <button onClick={() => setManageCampaignId(campaign.id)} className="text-[10px] px-2 py-1 bg-dsa-gold/10 text-dsa-gold rounded hover:bg-dsa-gold/20 transition">
                        Verwalten
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Join Session Modal */}
      <Modal
        isOpen={showJoinSession}
        onClose={() => setShowJoinSession(false)}
        title="Session beitreten"
        footer={
          <>
            <button onClick={() => setShowJoinSession(false)} className="btn-ghost">Abbrechen</button>
            <button onClick={handleJoinSession} className="btn-primary">Beitreten</button>
          </>
        }
      >
        <div>
          <label className="label">Session-Code</label>
          <input
            type="text"
            value={sessionCode}
            onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
            className="input-field text-center text-2xl font-mono tracking-widest"
            placeholder="TAVERNE-42"
            maxLength={20}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleJoinSession()}
          />
          <p className="text-xs text-dsa-parchment-dark mt-2 text-center">
            Der Spielleiter startet eine Session und gibt dir den Code.
          </p>
        </div>
      </Modal>

      {/* Join Campaign Modal */}
      <Modal
        isOpen={showJoinCampaign}
        onClose={() => { setShowJoinCampaign(false); setJoinError(''); setJoinSuccess('') }}
        title="Kampagne beitreten"
        footer={
          <>
            <button onClick={() => { setShowJoinCampaign(false); setJoinError(''); setJoinSuccess('') }} className="btn-ghost">
              Abbrechen
            </button>
            <button onClick={handleJoinCampaign} className="btn-primary" disabled={!!joinSuccess}>
              {joinSuccess ? <Check className="w-4 h-4" /> : 'Beitreten'}
            </button>
          </>
        }
      >
        <div>
          <label className="label">Kampagnen-Code</label>
          <input
            type="text"
            value={campaignCode}
            onChange={(e) => { setCampaignCode(e.target.value.toUpperCase()); setJoinError('') }}
            className="input-field text-center text-2xl font-mono tracking-widest"
            placeholder="ORKTURM-42"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleJoinCampaign()}
          />
          {joinError && (
            <div className="mt-2 flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {joinError}
            </div>
          )}
          {joinSuccess && (
            <div className="mt-2 flex items-center gap-2 text-green-400 text-sm">
              <Check className="w-4 h-4" />
              {joinSuccess}
            </div>
          )}
          <p className="text-xs text-dsa-parchment-dark mt-2 text-center">
            Der Kampagnen-Code ist dauerhaft. Du trittst der Kampagne als Spieler bei.
          </p>
        </div>
      </Modal>

      {/* New Campaign Modal */}
      <Modal
        isOpen={showNewCampaign}
        onClose={() => setShowNewCampaign(false)}
        title="Neue Kampagne erstellen"
        footer={
          <>
            <button onClick={() => setShowNewCampaign(false)} className="btn-ghost">Abbrechen</button>
            <button onClick={handleCreateCampaign} className="btn-primary">Erstellen</button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Name der Kampagne</label>
            <input
              type="text"
              value={newCampaignName}
              onChange={(e) => setNewCampaignName(e.target.value)}
              className="input-field"
              placeholder="Der Turm des Orkschamanen"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Beschreibung (optional)</label>
            <textarea
              value={newCampaignDesc}
              onChange={(e) => setNewCampaignDesc(e.target.value)}
              className="input-field h-24 resize-none"
              placeholder="Worum geht es in dieser Kampagne?"
            />
          </div>
        </div>
      </Modal>

      {/* Campaign Manager */}
      {manageCampaignId && (
        <CampaignManager campaignId={manageCampaignId} onClose={() => setManageCampaignId(null)} />
      )}
    </div>
  )
}
