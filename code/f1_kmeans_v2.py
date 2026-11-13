from pyspark.sql import SparkSession
from pyspark.sql.functions import avg, max as spark_max, col
from pyspark.ml.feature import VectorAssembler, StandardScaler
from pyspark.ml.clustering import KMeans
from pyspark.ml.evaluation import ClusteringEvaluator

spark = SparkSession.builder.appName("F1-KMeans-Clustering").getOrCreate()

INPUT = "hdfs:///bda/f1-telemetry/processed/lap_features"
OUTPUT = "hdfs:///bda/f1-telemetry/analysis_v2/driver_clusters"

df = spark.read.parquet(INPUT)

# ============================================================
# 1. DRIVER-LEVEL FEATURES
# ============================================================

driver_df = (
    df.groupBy("driver")
    .agg(
        avg("avg_speed").alias("avg_speed"),
        spark_max("max_speed").alias("max_speed"),
        avg("avg_rpm").alias("avg_rpm"),
        avg("avg_throttle").alias("avg_throttle"),
        avg("avg_acceleration").alias("avg_acceleration"),
        avg("braking_percent").alias("braking_percent"),
        avg("drs_percent").alias("drs_percent")
    )
    .dropna()
)

features = [
    "avg_speed",
    "max_speed",
    "avg_rpm",
    "avg_throttle",
    "avg_acceleration",
    "braking_percent",
    "drs_percent"
]

assembler = VectorAssembler(
    inputCols=features,
    outputCol="raw_features"
)

assembled = assembler.transform(driver_df)

# Standardize because the features have different scales.
scaler = StandardScaler(
    inputCol="raw_features",
    outputCol="features",
    withStd=True,
    withMean=True
)

scaled = scaler.fit(assembled).transform(assembled)

# ============================================================
# 2. SILHOUETTE TEST: K = 2..5
# ============================================================

evaluator = ClusteringEvaluator(
    featuresCol="features",
    predictionCol="prediction",
    metricName="silhouette",
    distanceMeasure="squaredEuclidean"
)

results = []

for k in range(2, 6):

    kmeans = KMeans(
        k=k,
        seed=42,
        featuresCol="features",
        predictionCol="prediction"
    )

    model = kmeans.fit(scaled)
    predictions = model.transform(scaled)

    silhouette = evaluator.evaluate(predictions)

    results.append((k, float(silhouette)))

    print(
        "K =", k,
        "Silhouette =", silhouette
    )

# ============================================================
# 3. SELECT BEST K
# ============================================================

best_k, best_score = max(
    results,
    key=lambda x: x[1]
)

print("\n==============================")
print("SILHOUETTE RESULTS")
print("==============================")

for k, score in results:
    print(f"k={k}  silhouette={score:.6f}")

print(
    f"\nBEST K = {best_k}"
)
print(
    f"BEST SILHOUETTE = {best_score:.6f}"
)

# ============================================================
# 4. FINAL MODEL
# ============================================================

final_kmeans = KMeans(
    k=best_k,
    seed=42,
    featuresCol="features",
    predictionCol="cluster"
)

final_model = final_kmeans.fit(scaled)

clustered = final_model.transform(scaled)

# Save driver clusters
clustered.select(
    "driver",
    *features,
    "cluster"
).orderBy("cluster", "driver").write.mode(
    "overwrite"
).parquet(OUTPUT)

# ============================================================
# 5. CLUSTER SIZES
# ============================================================

print("\n==============================")
print("CLUSTER SIZES")
print("==============================")

clustered.groupBy("cluster").count().orderBy(
    "cluster"
).show()

# ============================================================
# 6. CLUSTER CENTROIDS
# ============================================================

print("\n==============================")
print("CLUSTER CENTROIDS")
print("==============================")

centers = final_model.clusterCenters()

for i, center in enumerate(centers):

    print(f"\nCluster {i}")

    for feature, value in zip(features, center):
        print(
            f"  {feature}: {value:.4f}"
        )

# ============================================================
# 7. DRIVER MEMBERS
# ============================================================

print("\n==============================")
print("DRIVERS BY CLUSTER")
print("==============================")

clustered.select(
    "driver",
    "cluster"
).orderBy(
    "cluster",
    "driver"
).show(100, False)

print("\nOutput:", OUTPUT)

spark.stop()
