import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Shield, Mail, Lock, LogIn, Eye, EyeOff } from 'lucide-react'
import useAuthStore from '../../stores/authStore'

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const token = useAuthStore((s) => s.token)
  const loading = useAuthStore((s) => s.loading)
  const error = useAuthStore((s) => s.error)
  const clearError = useAuthStore((s) => s.clearError)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

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
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      // Error is set in store
    }
  }

  return (
    <div className="min-h-screen bg-dsa-bg flex flex-col items-center justify-center px-4">
      {/* Background decorative element */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-dsa-gold/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-dsa-bg-card border-2 border-dsa-gold/30 rounded mb-4">
            <Shield className="w-8 h-8 text-dsa-gold" />
          </div>
          <h1 className="text-3xl font-display font-bold text-dsa-gold">Aventuria VTT</h1>
          <p className="text-sm text-dsa-parchment-dark mt-2">Das Schwarze Auge - Virtueller Spieltisch</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-dsa-danger/10 border border-dsa-danger/30 rounded-sm px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

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
                placeholder="Passwort eingeben"
                required
                autoComplete="current-password"
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

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-dsa-bg/30 border-t-dsa-bg rounded-full animate-spin" />
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Anmelden
              </>
            )}
          </button>
        </form>

        <div className="text-center">
          <p className="text-sm text-dsa-parchment-dark">
            Noch kein Konto?{' '}
            <Link to="/register" className="text-dsa-gold hover:text-dsa-gold-light underline">
              Registrieren
            </Link>
          </p>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-dsa-parchment-dark/40">
          Aventuria VTT - Ein Fan-Projekt fuer DSA5
        </div>
      </div>
    </div>
  )
}
