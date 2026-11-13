from pyspark.sql import SparkSession
from pyspark.sql.functions import col, lag, lead
from pyspark.sql.window import Window
from pyspark.ml import Pipeline
from pyspark.ml.feature import StringIndexer, VectorAssembler
from pyspark.ml.regression import RandomForestRegressor
from pyspark.ml.evaluation import RegressionEvaluator
import json
import re
import sys

# Retrains the next-lap Random Forest (same data prep and parameters as
# f1_next_lap_prediction_v2.py) and exports the trees as JSON so the
# website can run the Spark model in the browser.

spark = SparkSession.builder.appName("F1-Export-RF-Model").getOrCreate()

INPUT = "hdfs:///bda/f1-telemetry/processed/lap_features"
MODEL_OUT = "hdfs:///bda/f1-telemetry/models/next_lap_rf"
JSON_OUT = sys.argv[1] if len(sys.argv) > 1 else "next_lap_rf.json"

FEATURES = [
    "previous_lap_time",
    "tyre_life",
    "stint",
    "track_temp",
    "lap",
    "compound_index"
]

df = spark.read.parquet(INPUT)

# ============================================================
# 1. SAME PREPARATION AS f1_next_lap_prediction_v2.py
# ============================================================

df = df.filter(
    (col("is_push_lap") == 1) &
    (col("is_accurate") == True) &
    (col("track_status") == "1") &
    (col("is_pit_lap") == 0) &
    (col("lap_time").isNotNull()) &
    (col("lap_time") > 0) &
    (col("tyre_life").isNotNull()) &
    (col("compound").isNotNull()) &
    (col("stint").isNotNull()) &
    (col("lap").isNotNull())
)

window = Window.partitionBy("session", "driver").orderBy("lap")

df = (
    df
    .withColumn("previous_lap_time", lag("lap_time").over(window))
    .withColumn("next_lap_time", lead("lap_time").over(window))
    .filter(
        col("previous_lap_time").isNotNull() &
        col("next_lap_time").isNotNull()
    )
    .withColumn("track_temp", col("track_temp_c").cast("double"))
    .fillna({"track_temp": 30.0})
    .orderBy("session", "driver", "lap")
)

rows = df.count()
train = df.limit(int(rows * 0.80))
test = df.subtract(train)

indexer = StringIndexer(
    inputCol="compound",
    outputCol="compound_index",
    handleInvalid="keep"
)

assembler = VectorAssembler(
    inputCols=FEATURES,
    outputCol="features",
    handleInvalid="skip"
)

rf = RandomForestRegressor(
    featuresCol="features",
    labelCol="next_lap_time",
    predictionCol="prediction",
    numTrees=80,
    maxDepth=8,
    seed=42
)

model = Pipeline(stages=[indexer, assembler, rf]).fit(train)
model.write().overwrite().save(MODEL_OUT)

predictions = model.transform(test)

metrics = {
    name: RegressionEvaluator(
        labelCol="next_lap_time",
        predictionCol="prediction",
        metricName=name
    ).evaluate(predictions)
    for name in ["mae", "rmse", "r2"]
}

# ============================================================
# 2. PARSE toDebugString INTO NESTED JSON TREES
# ============================================================

SPLIT = re.compile(
    r"If \(feature (\d+) (<=|>|in|not in) (\{[^}]*\}|[-\d.E]+)\)"
)


def parse_tree(lines):
    """Turn one tree's debug lines into {f, t|c, l, r} / {v} nodes."""
    pos = 0

    def node():
        nonlocal pos
        line = lines[pos].strip()
        pos += 1
        if line.startswith("Predict:"):
            return {"v": float(line.split(":")[1])}
        m = SPLIT.match(line)
        feature, op, value = int(m.group(1)), m.group(2), m.group(3)
        left = node()
        pos += 1  # skip the matching "Else (...)" line
        right = node()
        if op == "<=":
            return {"f": feature, "t": float(value), "l": left, "r": right}
        cats = [float(x) for x in value.strip("{}").split(",") if x.strip()]
        if op == "not in":
            left, right = right, left
        return {"f": feature, "c": cats, "l": left, "r": right}

    return node()


forest = model.stages[-1]
trees = []
for tree in forest.trees:
    lines = [
        line for line in tree.toDebugString.splitlines()[1:]
        if line.strip()
    ]
    trees.append(parse_tree(lines))

sample = (
    predictions
    .select("session", "driver", "lap", "compound", *FEATURES[:-1],
            "next_lap_time", "prediction")
    .limit(25)
    .collect()
)

export = {
    "model": "Spark MLlib RandomForestRegressor",
    "numTrees": len(trees),
    "maxDepth": 8,
    "features": FEATURES,
    "compoundLabels": list(model.stages[0].labelsArray[0]),
    "featureImportances": list(forest.featureImportances.toArray()),
    "trainRows": train.count(),
    "testRows": test.count(),
    "metrics": metrics,
    "sample": [r.asDict() for r in sample],
    "trees": trees
}

with open(JSON_OUT, "w") as f:
    json.dump(export, f)

print("\n==============================")
print("RANDOM FOREST EXPORT")
print("==============================")
print("Trees:", len(trees))
print("Compound labels:", export["compoundLabels"])
print("Metrics:", metrics)
print("Spark model:", MODEL_OUT)
print("JSON:", JSON_OUT)

spark.stop()
