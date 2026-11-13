import { createContext, useContext, useMemo, useState, useId } from 'react'
import { motion } from 'framer-motion'
import { useData } from '../lib/data'
import { compound } from '../lib/format'

/* ---------- Meta (event, circuit, drivers) ---------- */

export function useMeta() {
  const [data, error] = useData('meta.json')
  const meta = data && data[0]
  const extra = useMemo(() => {
    if (!meta) return null
    const byCode = Object.fromEntries(meta.drivers.map((d) => [d.code, d]))
    return { ...meta, byCode }
  }, [meta])
  return [extra, error]
}

/* ---------- Session selection shared between pages ---------- */

const SessionCtx = createContext(null)

export function SessionProvider({ children }) {
  const [slug, setSlug] = useState(() => {
    try {
      return localStorage.getItem('f1-session') || 'race'
    } catch {
      return 'race'
    }
  })
  const set = (s) => {
    setSlug(s)
    try {
      localStorage.setItem('f1-session', s)
    } catch {
      /* storage unavailable */
    }
  }
  return <SessionCtx.Provider value={[slug, set]}>{children}</SessionCtx.Provider>
}

export const useSession = () => useContext(SessionCtx)

export function SessionPicker({ sessions, only }) {
  const [slug, setSlug] = useSession()
  const list = only ? sessions.filter((s) => only.includes(s.slug)) : sessions
  return <Seg value={slug} onChange={setSlug} options={list.map((s) => ({ value: s.slug, label: s.short }))} />
}

/* ---------- Page wrapper with entry animation ---------- */

export function Page({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

export function PageHead({ kicker, title, children, right }) {
  return (
    <div className="page-head">
      <div>
        <div className="kicker">{kicker}</div>
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {right}
    </div>
  )
}

export function Reveal({ children, delay = 0, className, style }) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

export function Card({ title, right, note, children, className = '', style }) {
  return (
    <div className={`card ${className}`} style={style}>
      {(title || right) && (
        <div className="card-head">
          {title && <div className="card-title">{title}</div>}
          {right}
        </div>
      )}
      {note && <p className="card-note">{note}</p>}
      {children}
    </div>
  )
}

export function Stat({ label, value, sub, color }) {
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={color ? { color } : undefined}>
        {value}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export function Loader({ label = 'Loading data' }) {
  return (
    <div className="loader">
      <div className="loader-tyre" />
      {label}
    </div>
  )
}

export function ErrorBox({ error }) {
  return (
    <div className="error-box">
      <b>Could not load data.</b> <span className="muted">{String(error?.message || error)}</span>
      <p className="muted" style={{ marginBottom: 0 }}>
        Run <code>npm run data</code> in the website folder to rebuild the data files.
      </p>
    </div>
  )
}

/** Render children once all data is ready, otherwise a loader / error. */
export function Ready({ error, ready, children, label }) {
  if (error) return <ErrorBox error={error} />
  if (!ready) return <Loader label={label} />
  return children()
}

/* ---------- Segmented control with sliding pill ---------- */

export function Seg({ value, onChange, options }) {
  const id = useId()
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {value === o.value && (
            <motion.i className="seg-pill" layoutId={`seg-${id}`} transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
          )}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}

/* ---------- Tyres ---------- */

export function Tyre({ c, size = 22, age }) {
  const t = compound(c)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title={c || 'Unknown'}>
      <span className="tyre" style={{ width: size, height: size, borderColor: t.color, color: t.color, fontSize: size * 0.48 }}>
        {t.letter}
      </span>
      {age != null && <span className="mono muted" style={{ fontSize: 12 }}>{age}</span>}
    </span>
  )
}

/* ---------- Driver chips (toggle visibility) ---------- */

export function DriverChips({ drivers, active, onToggle, onOnly }) {
  return (
    <div className="chips">
      {drivers.map((d) => (
        <span
          key={d.code}
          className={`chip ${active.has(d.code) ? '' : 'off'}`}
          onClick={() => onToggle(d.code)}
          onDoubleClick={() => onOnly && onOnly(d.code)}
          title={`${d.first} ${d.last} — click to toggle, double-click to solo`}
        >
          <i style={{ background: d.color }} />
          {d.code}
        </span>
      ))}
    </div>
  )
}

export function useToggleSet(initial) {
  const [set, setSet] = useState(() => new Set(initial))
  const toggle = (k) =>
    setSet((s) => {
      const n = new Set(s)
      n.has(k) ? n.delete(k) : n.add(k)
      return n
    })
  const only = (k) => setSet(new Set([k]))
  const all = (keys) => setSet(new Set(keys))
  return [set, toggle, only, all, setSet]
}

export function DriverName({ d, short }) {
  if (!d) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      <span className="team-bar" style={{ background: d.color }} />
      {short ? <b>{d.code}</b> : (
        <span>
          {d.first} <b className="upper">{d.last}</b>
        </span>
      )}
    </span>
  )
}
