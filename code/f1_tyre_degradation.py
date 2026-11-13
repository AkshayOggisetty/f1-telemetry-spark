from pyspark.sql import SparkSession
from pyspark.sql.functions import col, when, avg, count
from pyspark.ml.feature import StringIndexer, VectorAssembler
from pyspark.ml.regression import LinearRegression
from pyspark.ml import Pipeline

spark = SparkSession.builder.appName("F1-Tyre-Degradation").getOrCreate()

input_path = "hdfs:///bda/f1-telemetry/processed/lap_features"
output_path = "hdfs:///bda/f1-telemetry/analysis_v2/tyre_degradation"

df = spark.read.parquet(input_path)

# ------------------------------------------------------------
# Clean push laps
# ------------------------------------------------------------
df = df.filter(
    (col("is_push_lap") == 1) &
    (col("is_accurate") == True) &
    (col("track_status") == "1") &
    (col("is_pit_lap") == 0) &
    (col("lap_time").isNotNull()) &
    (col("lap_time") > 0) &
    (col("tyre_life").isNotNull()) &
    (col("tyre_life") > 0) &
    (col("lap").isNotNull())
)

# Keep only commonly meaningful compounds
df = df.filter(
    col("compound").isin(
        "SOFT", "MEDIUM", "HARD",
        "INTERMEDIATE", "WET"
    )
)

# ------------------------------------------------------------
# Encode compound
# ------------------------------------------------------------
indexer = StringIndexer(
    inputCol="compound",
    outputCol="compound_index",
    handleInvalid="keep"
)

assembler = VectorAssembler(
    inputCols=["tyre_life", "lap", "compound_index"],
    outputCol="features"
)

pipeline = Pipeline(stages=[indexer, assembler])

prepared = pipeline.fit(df).transform(df)

# ------------------------------------------------------------
# Overall tyre degradation model
# ------------------------------------------------------------
model = LinearRegression(
    featuresCol="features",
    labelCol="lap_time",
    predictionCol="prediction"
)

fitted = model.fit(prepared)

print("\n==============================")
print("OVERALL TYRE DEGRADATION")
print("==============================")

print("Intercept:", fitted.intercept)
print("Coefficients:", fitted.coefficients)

print(
    "Tyre-life degradation (sec/lap):",
    fitted.coefficients[0]
)

print("RMSE:", fitted.summary.rootMeanSquaredError)
print("R2:", fitted.summary.r2)

# ------------------------------------------------------------
# Per-compound degradation
# ------------------------------------------------------------
results = []

compounds = [
    r["compound"]
    for r in df.select("compound").distinct().collect()
]

for compound in compounds:

    subset = df.filter(col("compound") == compound)

    if subset.count() < 10:
        continue

    assembler_c = VectorAssembler(
        inputCols=["tyre_life", "lap"],
        outputCol="features"
    )

    prepared_c = assembler_c.transform(subset)

    model_c = LinearRegression(
        featuresCol="features",
        labelCol="lap_time"
    )

    fitted_c = model_c.fit(prepared_c)

    results.append((
        compound,
        subset.count(),
        float(fitted_c.coefficients[0]),
        float(fitted_c.coefficients[1]),
        float(fitted_c.intercept),
        float(fitted_c.summary.rootMeanSquaredError),
        float(fitted_c.summary.r2)
    ))

# ------------------------------------------------------------
# Create result table
# ------------------------------------------------------------
result_df = spark.createDataFrame(
    results,
    [
        "compound",
        "sample_count",
        "degradation_sec_per_tyre_life",
        "lap_effect_sec_per_lap",
        "intercept",
        "rmse",
        "r2"
    ]
)

result_df = result_df.orderBy(
    col("degradation_sec_per_tyre_life").desc()
)

result_df.write.mode("overwrite").parquet(output_path)

print("\n==============================")
print("PER-COMPOUND RESULTS")
print("==============================")

result_df.show(20, False)

print("\nOutput:", output_path)

spark.stop()
