import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, useLocation, Navigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { SessionProvider } from './components/ui'
import Home from './pages/Home'
import Replay from './pages/Replay'
import RaceAnalysis from './pages/RaceAnalysis'
import Telemetry from './pages/Telemetry'
import LapTimes from './pages/LapTimes'
import Insights from './pages/Insights'
import Predictor from './pages/Predictor'
import Pipeline from './pages/Pipeline'
import Present from './pages/Present'
import NotFound from './pages/NotFound'

export const ROUTES = [
  { path: '/', label: 'Home', element: <Home /> },
  { path: '/replay', label: 'Live Replay', element: <Replay /> },
  { path: '/race', label: 'Race Analysis', element: <RaceAnalysis /> },
  { path: '/telemetry', label: 'Telemetry', element: <Telemetry /> },
  { path: '/laptimes', label: 'Lap Times', element: <LapTimes /> },
  { path: '/insights', label: 'Spark ML', element: <Insights /> },
  { path: '/predictor', label: 'Predictor', element: <Predictor /> },
  { path: '/pipeline', label: 'Pipeline', element: <Pipeline /> },
  { path: '/present', label: 'Presentation', element: <Present /> },
]

function Brand() {
  return (
    <NavLink to="/" className="brand" aria-label="Home">
      <svg className="brand-mark" viewBox="0 0 76 44" aria-hidden="true">
        <path d="M0 44 L26 10 Q32 2 42 2 H76 L68 14 H44 Q38 14 34 20 L28 28 H60 L52 40 H24 L21 44 Z" fill="#e10600" />
      </svg>
      <span>
        BAKU 2025
        <small>TELEMETRY ANALYTICS</small>
      </span>
    </NavLink>
  )
}

export default function App() {
  const location = useLocation()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(false)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])

  return (
    <SessionProvider>
      <div className="app">
        <header className="topbar">
          <div className="topbar-inner">
            <Brand />
            <button className="menu-btn" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                <path d={open ? 'M6 6l12 12M18 6L6 18' : 'M3 7h18M3 12h18M3 17h18'} />
              </svg>
            </button>
            <nav className={`nav ${open ? 'open' : ''}`}>
              {ROUTES.map((r) => (
                <NavLink key={r.path} to={r.path} end={r.path === '/'}>
                  {({ isActive }) => (
                    <>
                      {r.label}
                      {isActive && <motion.span className="nav-underline" layoutId="nav-underline" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>

        <main>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              {ROUTES.map((r) => (
                <Route key={r.path} path={r.path} element={r.element} />
              ))}
              <Route path="/home" element={<Navigate to="/" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AnimatePresence>
        </main>

        <footer className="footer">
          Data: <a href="https://github.com/TracingInsights/2025" target="_blank" rel="noreferrer">TracingInsights/2025</a> (Apache-2.0,
          DOI <a href="https://doi.org/10.5281/zenodo.17312803" target="_blank" rel="noreferrer">10.5281/zenodo.17312803</a>) · Processed with Apache
          Spark 4.0.4 on a 3-node Hadoop 3.5.0 YARN cluster · Unofficial student project, not affiliated with Formula 1.
        </footer>
      </div>
    </SessionProvider>
  )
}
