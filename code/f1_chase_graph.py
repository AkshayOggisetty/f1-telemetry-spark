from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    col, count, sum, min, max, round,
    when, lag, coalesce, lit
)
from pyspark.sql.window import Window

spark = SparkSession.builder.appName("F1-Chase-Graph").getOrCreate()

TELEMETRY = "hdfs:///bda/f1-telemetry/processed/cleaned_v2"
LAPTIMES = "hdfs:///bda/f1-telemetry/raw/laptimes.csv"
OUTPUT = "hdfs:///bda/f1-telemetry/analysis_v2/chase_graph"

# --------------------------------------------------
# 1. READ DATA
# --------------------------------------------------

telemetry = spark.read.parquet(TELEMETRY)

laps = (
    spark.read
    .option("header", True)
    .option("inferSchema", True)
    .csv(LAPTIMES)
)

# --------------------------------------------------
# 2. DRIVER NUMBER -> DRIVER ABBREVIATION
# --------------------------------------------------

driver_map = (
    laps
    .select(
        col("driver_number").cast("string").alias("driver_number"),
        col("driver").alias("driver")
    )
    .filter(col("driver_number").isNotNull())
    .dropDuplicates(["driver_number"])
)

# --------------------------------------------------
# 3. SELECT CHASE TELEMETRY
# --------------------------------------------------

chase = (
    telemetry
    .filter(
        col("DriverAhead").isNotNull() &
        col("DistanceToDriverAhead").isNotNull() &
        (col("DistanceToDriverAhead") > 0) &
        (col("DistanceToDriverAhead") < 50)
    )
    .select(
        "session",
        "driver",
        "lap",
        "time",
        "DriverAhead",
        "DistanceToDriverAhead"
    )
)

# --------------------------------------------------
# 4. MAP DRIVER AHEAD NUMBER -> DRIVER CODE
# --------------------------------------------------

chase = (
    chase
    .withColumn(
        "driver_ahead_number",
        col("DriverAhead").cast("string")
    )
    .join(
        driver_map.withColumnRenamed("driver", "driver_ahead"),
        col("driver_ahead_number") == col("driver_number"),
        "left"
    )
    .drop("driver_number")
)

# --------------------------------------------------
# 5. REMOVE INVALID / SELF EDGES
# --------------------------------------------------

edges = (
    chase
    .filter(col("driver_ahead").isNotNull())
    .filter(col("driver") != col("driver_ahead"))
)

# --------------------------------------------------
# 6. EDGE WEIGHT
# --------------------------------------------------

edge_counts = (
    edges
    .groupBy("driver", "driver_ahead")
    .agg(
        count("*").alias("weight"),
        min("DistanceToDriverAhead").alias("min_distance"),
        round(
            sum(
                when(
                    col("time").isNotNull(),
                    lit(1.0)
                ).otherwise(lit(0.0))
            ),
            2
        ).alias("close_samples")
    )
)

# --------------------------------------------------
# 7. APPROXIMATE CLOSE-BEHIND DURATION
# --------------------------------------------------

# Convert timestamp-like telemetry time into seconds where possible.
# Consecutive samples are treated as approximately 0.1 s apart
# when exact time differences are unavailable.

edges_with_time = (
    edges
    .withColumn(
        "time_seconds",
        col("time").cast("double")
    )
)

window = Window.partitionBy(
    "session", "driver", "driver_ahead"
).orderBy("time_seconds")

timed = (
    edges_with_time
    .withColumn("prev_time", lag("time_seconds").over(window))
    .withColumn(
        "interval",
        when(
            col("prev_time").isNotNull() &
            (col("time_seconds") > col("prev_time")) &
            ((col("time_seconds") - col("prev_time")) < 5),
            col("time_seconds") - col("prev_time")
        ).otherwise(lit(0.0))
    )
)

duration_edges = (
    timed
    .groupBy("driver", "driver_ahead")
    .agg(
        count("*").alias("weight"),
        round(sum("interval"), 2).alias("duration_seconds"),
        round(min("DistanceToDriverAhead"), 2).alias("min_distance")
    )
)

# --------------------------------------------------
# 8. FINAL EDGE TABLE
# --------------------------------------------------

final_edges = (
    duration_edges
    .withColumnRenamed("driver", "src")
    .withColumnRenamed("driver_ahead", "dst")
    .orderBy(col("weight").desc())
)

# --------------------------------------------------
# 9. VERTICES
# --------------------------------------------------

src_vertices = final_edges.select(col("src").alias("id"))
dst_vertices = final_edges.select(col("dst").alias("id"))

vertices = (
    src_vertices
    .union(dst_vertices)
    .dropDuplicates()
)

# --------------------------------------------------
# 10. DRIVER DEGREE TABLES
# --------------------------------------------------

out_degree = (
    final_edges
    .groupBy("src")
    .agg(
        count("*").alias("out_degree"),
        sum("weight").alias("out_weight")
    )
)

in_degree = (
    final_edges
    .groupBy("dst")
    .agg(
        count("*").alias("in_degree"),
        sum("weight").alias("in_weight")
    )
)

# --------------------------------------------------
# 11. SAVE
# --------------------------------------------------

final_edges.write.mode("overwrite").parquet(
    OUTPUT + "/edges"
)

vertices.write.mode("overwrite").parquet(
    OUTPUT + "/vertices"
)

out_degree.write.mode("overwrite").parquet(
    OUTPUT + "/out_degree"
)

in_degree.write.mode("overwrite").parquet(
    OUTPUT + "/in_degree"
)

# --------------------------------------------------
# 12. DISPLAY RESULTS
# --------------------------------------------------

print("\n==============================")
print("F1 CHASE GRAPH")
print("==============================")

print("\n=== TOTAL CHASE SAMPLES ===")
print(edges.count())

print("\n=== TOP CHASE EDGES ===")
final_edges.show(20, False)

print("\n=== OUT-DEGREE ===")
out_degree.orderBy(col("out_weight").desc()).show(20, False)

print("\n=== IN-DEGREE ===")
in_degree.orderBy(col("in_weight").desc()).show(20, False)

print("\n=== OUTPUT ===")
print(OUTPUT)

spark.stop()
