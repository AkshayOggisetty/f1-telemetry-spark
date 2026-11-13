from pyspark.sql import SparkSession
from pyspark.sql.functions import col, percentile_approx, lit
from pyspark.ml.feature import VectorAssembler, StandardScaler
from pyspark.ml.clustering import KMeans
from pyspark.ml.functions import vector_to_array

spark = SparkSession.builder.appName("F1-Anomaly-Detection").getOrCreate()

INPUT = "hdfs:///bda/f1-telemetry/processed/lap_features"
OUTPUT = "hdfs:///bda/f1-telemetry/analysis_v2/telemetry_anomalies"

df = spark.read.parquet(INPUT)

features = [
    "avg_speed",
    "max_speed",
    "avg_rpm",
    "avg_throttle",
    "avg_acceleration",
    "braking_percent",
    "drs_percent"
]

clean = df.dropna(subset=features)

assembler = VectorAssembler(
    inputCols=features,
    outputCol="raw_features"
)

assembled = assembler.transform(clean)

scaler = StandardScaler(
    inputCol="raw_features",
    outputCol="features",
    withStd=True,
    withMean=True
)

scaled_model = scaler.fit(assembled)
scaled = scaled_model.transform(assembled)

# K-Means with 5 clusters, selected in Step 8
kmeans = KMeans(
    k=5,
    seed=42,
    featuresCol="features",
    predictionCol="cluster"
)

model = kmeans.fit(scaled)
predictions = model.transform(scaled)

# Squared distance from each lap to its assigned centroid
centers = model.clusterCenters()

from pyspark.sql.types import DoubleType
from pyspark.sql.functions import udf

def distance_to_center(cluster, vector):
    center = centers[int(cluster)]
    return float(sum(
        (float(vector[i]) - float(center[i])) ** 2
        for i in range(len(center))
    ))

distance_udf = udf(distance_to_center, DoubleType())

scored = predictions.withColumn(
    "anomaly_score",
    distance_udf(col("cluster"), col("features"))
)

# Top 1% most unusual laps
threshold = scored.select(
    percentile_approx("anomaly_score", 0.99, 10000)
    .alias("threshold")
).collect()[0]["threshold"]

anomalies = (
    scored
    .filter(col("anomaly_score") >= lit(threshold))
    .select(
        "session",
        "driver",
        "lap",
        "lap_time",
        "compound",
        "tyre_life",
        "avg_speed",
        "max_speed",
        "avg_rpm",
        "avg_throttle",
        "avg_acceleration",
        "braking_percent",
        "drs_percent",
        "cluster",
        "anomaly_score"
    )
    .orderBy(col("anomaly_score").desc())
)

anomalies.write.mode("overwrite").parquet(OUTPUT)

print("\n==============================")
print("ANOMALY DETECTION")
print("==============================")
print("Total valid laps:", scored.count())
print("99th percentile threshold:", threshold)
print("Anomalies:", anomalies.count())

print("\nTOP ANOMALIES")
anomalies.show(30, False)

print("\nANOMALIES BY SESSION")
anomalies.groupBy("session").count().orderBy(col("count").desc()).show()

print("\nANOMALIES BY DRIVER")
anomalies.groupBy("driver").count().orderBy(col("count").desc()).show()

print("\nOutput:", OUTPUT)

spark.stop()
