// Lap-level race maths shared by the replay and race-analysis pages.
// `laps` is { DRIVER: [{lap, time, end, start, pos, compound, ...}] } from laps.json.

/** Session time at which the first car completed each lap. */
export function leaderLapEnds(laps) {
  const best = []
  for (const L of Object.values(laps)) {
    for (const l of L) {
      if (l.end == null) continue
      if (best[l.lap] == null || l.end < best[l.lap]) best[l.lap] = l.end
    }
  }
  return best
}

/** Gap to the leader at the end of every lap, per driver: the "worm". */
export function gapToLeader(laps) {
  const lead = leaderLapEnds(laps)
  const out = {}
  for (const [code, L] of Object.entries(laps)) {
    out[code] = L.filter((l) => l.end != null && lead[l.lap] != null).map((l) => ({ x: l.lap, y: l.end - lead[l.lap] }))
  }
  return out
}

/**
 * Race trace: cumulative time compared with a reference pace (the winner's
 * average lap). Positive = ahead of the reference.
 */
export function raceTrace(laps, winner) {
  const W = laps[winner]
  if (!W || !W.length) return {}
  const t0 = W[0].start
  const avg = (W[W.length - 1].end - t0) / W.length
  const out = {}
  for (const [code, L] of Object.entries(laps)) {
    out[code] = L.filter((l) => l.end != null).map((l) => ({ x: l.lap, y: l.lap * avg - (l.end - t0) }))
  }
  return out
}

export function positions(laps) {
  const out = {}
  for (const [code, L] of Object.entries(laps)) {
    out[code] = L.filter((l) => l.pos != null).map((l) => ({ x: l.lap, y: l.pos }))
  }
  return out
}

/** Track-status periods (non-green) as [{from, to, code}] in session time. */
export function statusPeriods(trackStatus, end) {
  const out = []
  for (let i = 0; i < trackStatus.length; i++) {
    const s = trackStatus[i]
    if (s.code === '1') continue
    const to = i + 1 < trackStatus.length ? trackStatus[i + 1].t : end
    out.push({ from: s.t, to, code: s.code, label: s.label })
  }
  return out
}

/** Convert session-time periods to lap-number periods using the leader's lap ends. */
export function periodsToLaps(periods, lead) {
  const lapAt = (t) => {
    for (let n = 1; n < lead.length; n++) {
      if (lead[n] != null && lead[n] >= t) {
        const prev = lead[n - 1] ?? lead[n] - 105
        return n - 1 + (t - prev) / (lead[n] - prev)
      }
    }
    return lead.length - 1
  }
  return periods.map((p) => ({ ...p, from: lapAt(p.from), to: lapAt(p.to) }))
}
