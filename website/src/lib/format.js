export function lapTime(s) {
  if (s == null || Number.isNaN(s)) return '—'
  const m = Math.floor(s / 60)
  const rest = s - m * 60
  return m > 0 ? `${m}:${rest.toFixed(3).padStart(6, '0')}` : rest.toFixed(3)
}

export function gap(s, digits = 3) {
  if (s == null) return '—'
  return (s >= 0 ? '+' : '−') + Math.abs(s).toFixed(digits)
}

export function clock(s) {
  if (s == null) return '—'
  const sign = s < 0 ? '-' : ''
  s = Math.abs(s)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h ? `${sign}${h}:${mm}:${ss}` : `${sign}${mm}:${ss}`
}

export const COMPOUNDS = {
  SOFT: { color: '#ff3333', letter: 'S' },
  MEDIUM: { color: '#ffd12e', letter: 'M' },
  HARD: { color: '#f0f0ec', letter: 'H' },
  INTERMEDIATE: { color: '#43b02a', letter: 'I' },
  WET: { color: '#0067ad', letter: 'W' },
  UNKNOWN: { color: '#7a7a85', letter: '?' },
}

export const compound = (c) => COMPOUNDS[c] || COMPOUNDS.UNKNOWN

export const TRACK_STATUS = {
  '1': { label: 'Track Clear', color: '#00d26a' },
  '2': { label: 'Yellow Flag', color: '#ffd12e' },
  '4': { label: 'Safety Car', color: '#ffb800' },
  '5': { label: 'Red Flag', color: '#e10600' },
  '6': { label: 'Virtual Safety Car', color: '#ffb800' },
  '7': { label: 'VSC Ending', color: '#ffb800' },
}
