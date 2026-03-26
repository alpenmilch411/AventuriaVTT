import { createBrowserRouter, Navigate } from 'react-router-dom'
import LoginPage from './views/auth/LoginPage'
import RegisterPage from './views/auth/RegisterPage'
import Dashboard from './views/auth/Dashboard'
import CharacterDetail from './views/auth/CharacterDetail'
import CompletionView from './views/auth/CompletionView'
import GMCockpit from './views/gm/GMCockpit'
import PlayerDashboard from './views/player/PlayerDashboard'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/dashboard',
    element: <Dashboard />,
  },
  {
    path: '/character/:characterId',
    element: <CharacterDetail />,
  },
  {
    path: '/session/:sessionId/complete',
    element: <CompletionView />,
  },
  {
    path: '/gm/:sessionCode',
    element: <GMCockpit />,
  },
  {
    path: '/play/:sessionCode',
    element: <PlayerDashboard />,
  },
  // Legacy routes redirect to dashboard
  {
    path: '/campaign/:campaignId',
    element: <Navigate to="/dashboard" replace />,
  },
  {
    path: '/table/:sessionCode',
    element: <Navigate to="/dashboard" replace />,
  },
  {
    path: '/prep/:campaignId',
    element: <Navigate to="/dashboard" replace />,
  },
])
