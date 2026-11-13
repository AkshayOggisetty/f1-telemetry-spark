// Evaluates the Spark MLlib RandomForestRegressor exported by
// code/f1_export_rf_model.py. Each node is either a leaf {v} or a split
// {f, t, l, r} (continuous: go left when x[f] <= t) or {f, c, l, r}
// (categorical: go left when x[f] is in the category list c).

function walk(node, x) {
  while (node.v === undefined) {
    const value = x[node.f]
    const left = node.c ? node.c.includes(value) : value <= node.t
    node = left ? node.l : node.r
  }
  return node.v
}

export function treePredictions(model, x) {
  return model.trees.map((tree) => walk(tree, x))
}

export function predict(model, x) {
  const votes = treePredictions(model, x)
  return votes.reduce((a, b) => a + b, 0) / votes.length
}

/** Feature vector in the model's order from a readable input object. */
export function features(model, input) {
  const idx = model.compoundLabels.indexOf(input.compound)
  const values = {
    previous_lap_time: input.previousLap,
    tyre_life: input.tyreLife,
    stint: input.stint,
    track_temp: input.trackTemp,
    lap: input.lap,
    // StringIndexer(handleInvalid="keep") maps unseen labels to labels.length
    compound_index: idx === -1 ? model.compoundLabels.length : idx,
  }
  return model.features.map((f) => values[f])
}

/** Roll the model forward lap by lap, feeding each prediction back in. */
export function projectStint(model, input, laps) {
  const out = []
  let prev = input.previousLap
  for (let i = 0; i < laps; i++) {
    const step = { ...input, previousLap: prev, tyreLife: input.tyreLife + i, lap: input.lap + i }
    const t = predict(model, features(model, step))
    out.push({ lap: step.lap + 1, tyreLife: step.tyreLife + 1, time: t })
    prev = t
  }
  return out
}
