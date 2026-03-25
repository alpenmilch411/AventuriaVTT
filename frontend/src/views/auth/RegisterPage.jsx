import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Shield, Mail, Lock, User, UserPlus, Eye, EyeOff } from 'lucide-react'
import useAuthStore from '../../stores/authStore'

export default function RegisterPage() {
  const navigate = useNavigate()
  const register = useAuthStore((s) => s.register)
  const token = useAuthStore((s) => s.token)
  const loading = useAuthStore((s) => s.loading)
  const error = useAuthStore((s) => s.error)
  const clearError = useAuthStore((s) => s.clearError)

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (token) {
      navigate('/dashboard')
    }
  }, [token, navigate])

  useEffect(() => {
    clearError()
  }, [clearError])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLocalError('')

    if (password !== confirmPassword) {
      setLocalError('Passwoerter stimmen nicht ueberein.')
      return
    }

    if (password.length < 6) {
      setLocalError('Passwort muss mindestens 6 Zeichen lang sein.')
      return
    }

    try {
      await register(username, email, password)
      navigate('/dashboard')
    } catch (err) {
      // Error is set in store
    }
  }

  const displayError = localError || error

  return (
    <div className="min-h-screen bg-dsa-bg flex flex-col items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-dsa-gold/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-dsa-bg-card border-2 border-dsa-gold/30 rounded mb-4">
            <Shield className="w-8 h-8 text-dsa-gold" />
          </div>
          <h1 className="text-3xl font-display font-bold text-dsa-gold">Konto erstellen</h1>
          <p className="text-sm text-dsa-parchment-dark mt-2">Werde Teil der Aventuria VTT-Gemeinschaft</p>
        </div>

        {/* Register Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {displayError && (
            <div className="bg-dsa-danger/10 border border-dsa-danger/30 rounded-sm px-4 py-3 text-sm text-red-400">
              {displayError}
            </div>
          )}

          <div>
            <label className="label">Benutzername</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dsa-parchment-dark/50" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field pl-10"
                placeholder="Dein Heldenname"
                required
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <label className="label">E-Mail</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dsa-parchment-dark/50" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field pl-10"
                placeholder="held@aventuria.de"
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <label className="label">Passwort</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dsa-parchment-dark/50" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pl-10 pr-10"
                placeholder="Mindestens 6 Zeichen"
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dsa-parchment-dark/50 hover:text-dsa-parchment"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="label">Passwort bestaetigen</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dsa-parchment-dark/50" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field pl-10"
                placeholder="Passwort wiederholen"
                required
                autoComplete="new-password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-dsa-bg/30 border-t-dsa-bg rounded-full animate-spin" />
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                Registrieren
              </>
            )}
          </button>
        </form>

        <div className="text-center">
          <p className="text-sm text-dsa-parchment-dark">
            Bereits ein Konto?{' '}
            <Link to="/" className="text-dsa-gold hover:text-dsa-gold-light underline">
              Anmelden
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
