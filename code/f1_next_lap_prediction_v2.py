from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    col, lag, lead, avg
)
from pyspark.sql.window import Window
from pyspark.ml import Pipeline
from pyspark.ml.feature import StringIndexer, VectorAssembler
from pyspark.ml.regression import RandomForestRegressor
from pyspark.ml.evaluation import RegressionEvaluator

spark = SparkSession.builder.appName(
    "F1-Next-Lap-Prediction"
).getOrCreate()

INPUT = "hdfs:///bda/f1-telemetry/processed/lap_features"
OUTPUT = "hdfs:///bda/f1-telemetry/analysis_v2/next_lap_prediction"

df = spark.read.parquet(INPUT)

# ============================================================
# 1. CLEAN PUSH LAPS
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

# ============================================================
# 2. CREATE PREVIOUS / NEXT LAP FEATURES
# ============================================================

window = Window.partitionBy(
    "session", "driver"
).orderBy("lap")

df = (
    df
    .withColumn("previous_lap_time", lag("lap_time").over(window))
    .withColumn("next_lap_time", lead("lap_time").over(window))
)

# Only keep consecutive laps.
df = df.filter(
    (col("previous_lap_time").isNotNull()) &
    (col("next_lap_time").isNotNull())
)

# ============================================================
# 3. TRACK TEMPERATURE
# ============================================================

# Some rows may not contain temperature.
# Fill missing values using the session average.
session_temp = (
    df.groupBy("session")
    .agg(avg("track_temp_c").alias("session_track_temp"))
)

df = df.join(session_temp, "session", "left")

df = df.withColumn(
    "track_temp",
    col("track_temp_c")
)

df = df.withColumn(
    "track_temp",
    col("track_temp").cast("double")
)

df = df.fillna(
    {"track_temp": 30.0}
)

# ============================================================
# 4. ENCODE COMPOUND
# ============================================================

indexer = StringIndexer(
    inputCol="compound",
    outputCol="compound_index",
    handleInvalid="keep"
)

# ============================================================
# 5. FEATURES
# ============================================================

assembler = VectorAssembler(
    inputCols=[
        "previous_lap_time",
        "tyre_life",
        "stint",
        "track_temp",
        "lap",
        "compound_index"
    ],
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

pipeline = Pipeline(
    stages=[indexer, assembler, rf]
)

# ============================================================
# 6. TIME-ORDERED TRAIN / TEST SPLIT
# ============================================================

# Sort by session, driver and lap.
# Earlier laps are training data; later laps are test data.

df = df.orderBy(
    "session", "driver", "lap"
)

rows = df.count()

split_point = int(rows * 0.80)

df = df.withColumn(
    "_row_id",
    col("lap")
)

# Use 80/20 split based on session/driver/lap ordering.
train = df.limit(split_point)

test = df.subtract(train)

print("\n==============================")
print("DATASET")
print("==============================")
print("Total rows:", rows)
print("Training rows:", train.count())
print("Testing rows:", test.count())

# ============================================================
# 7. TRAIN
# ============================================================

model = pipeline.fit(train)

predictions = model.transform(test).select(
    "session",
    "driver",
    "lap",
    "next_lap_time",
    "prediction"
)

# ============================================================
# 8. OVERALL METRICS
# ============================================================

mae_eval = RegressionEvaluator(
    labelCol="next_lap_time",
    predictionCol="prediction",
    metricName="mae"
)

rmse_eval = RegressionEvaluator(
    labelCol="next_lap_time",
    predictionCol="prediction",
    metricName="rmse"
)

r2_eval = RegressionEvaluator(
    labelCol="next_lap_time",
    predictionCol="prediction",
    metricName="r2"
)

mae = mae_eval.evaluate(predictions)
rmse = rmse_eval.evaluate(predictions)
r2 = r2_eval.evaluate(predictions)

print("\n==============================")
print("OVERALL RESULTS")
print("==============================")
print("MAE :", mae)
print("RMSE:", rmse)
print("R2  :", r2)

# ============================================================
# 9. PER-SESSION METRICS
# ============================================================

sessions = [
    r["session"]
    for r in predictions.select("session").distinct().collect()
]

session_results = []

for session in sessions:

    p = predictions.filter(col("session") == session)

    if p.count() < 5:
        continue

    session_results.append((
        session,
        p.count(),
        float(mae_eval.evaluate(p)),
        float(rmse_eval.evaluate(p)),
        float(r2_eval.evaluate(p))
    ))

session_df = spark.createDataFrame(
    session_results,
    [
        "session",
        "test_samples",
        "mae",
        "rmse",
        "r2"
    ]
)

print("\n==============================")
print("PER-SESSION RESULTS")
print("==============================")

session_df.orderBy("session").show(
    50, False
)

# ============================================================
# 10. SAVE RESULTS
# ============================================================

predictions.write.mode("overwrite").parquet(
    OUTPUT + "/predictions"
)

session_df.write.mode("overwrite").parquet(
    OUTPUT + "/session_metrics"
)

print("\nOutput:", OUTPUT)

spark.stop()
