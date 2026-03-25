import { useState, useEffect } from 'react'

export default function useOffline() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false)
      // Show "reconnected" briefly
      setShowBanner(true)
      setTimeout(() => setShowBanner(false), 3000)
    }

    const handleOffline = () => {
      setIsOffline(true)
      setShowBanner(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const OfflineBanner = () => {
    if (!showBanner) return null

    return (
      <div className={`fixed top-0 left-0 right-0 z-[9999] px-4 py-2 text-center text-sm font-medium transition-all duration-300 ${
        isOffline
          ? 'bg-dsa-danger text-white'
          : 'bg-dsa-success text-white'
      }`}>
        {isOffline
          ? 'Keine Verbindung. Versuche wiederzuverbinden...'
          : 'Verbindung wiederhergestellt!'
        }
      </div>
    )
  }

  return { isOffline, OfflineBanner }
}
