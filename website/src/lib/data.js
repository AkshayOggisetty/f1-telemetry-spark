import { useEffect, useState } from 'react'

const BASE = import.meta.env.BASE_URL
const cache = new Map()

export const asset = (path) => (path ? BASE + path : null)

export function load(path) {
  if (!cache.has(path)) {
    const p = fetch(BASE + 'data/' + path).then((r) => {
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
      return r.json()
    })
    p.catch(() => cache.delete(path))
    cache.set(path, p)
  }
  return cache.get(path)
}

/** Load one or more JSON files; returns [data | null, error | null]. */
export function useData(...paths) {
  const key = paths.join('|')
  const [state, setState] = useState({ key: null, data: null, error: null })

  useEffect(() => {
    let alive = true
    Promise.all(paths.map(load))
      .then((data) => alive && setState({ key, data, error: null }))
      .catch((error) => alive && setState({ key, data: null, error }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state.key === key ? [state.data, state.error] : [null, null]
}

export const sessionFile = (slug, file) => `sessions/${slug}/${file}.json`
