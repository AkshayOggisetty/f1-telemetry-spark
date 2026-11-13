from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    col, min, max, avg, sum, count, when
)

spark = SparkSession.builder \
    .appName("F1-Lap-Features-v2") \
    .getOrCreate()

telemetry_path = "hdfs:///bda/f1-telemetry/processed/cleaned_v2"
laptimes_path = "hdfs:///bda/f1-telemetry/raw/laptimes.csv"
output_path = "hdfs:///bda/f1-telemetry/processed/lap_features"

# --------------------------------------------------
# TELEMETRY
# --------------------------------------------------

t = spark.read.parquet(telemetry_path)

lap_telemetry = t.groupBy(
    "session", "driver", "lap"
).agg(
    min("speed").alias("min_speed"),
    avg("speed").alias("avg_speed"),
    max("speed").alias("max_speed"),

    avg("rpm").alias("avg_rpm"),
    max("rpm").alias("max_rpm"),

    avg("throttle_pct").alias("avg_throttle"),

    avg("braking").alias("braking_percent"),
    avg("drs_active").alias("drs_percent"),

    avg("acceleration_magnitude").alias("avg_acceleration"),

    max("distance").alias("lap_distance"),

    min("x").alias("start_x"),
    min("y").alias("start_y"),

    count("*").alias("telemetry_samples"),

    min("time").alias("lap_start_time"),
    max("time").alias("lap_end_time")
)

# --------------------------------------------------
# LAP TIMES
# Read using the actual CSV header.
# --------------------------------------------------

l = spark.read \
    .option("header", True) \
    .option("inferSchema", True) \
    .csv(laptimes_path)

# Keep only the columns actually required.
l = l.select(
    "session",
    "driver",
    "lap",

    col("lap_time_s").cast("double").alias("lap_time"),

    "compound",

    col("stint").cast("int").alias("stint"),
    col("tyre_life").cast("int").alias("tyre_life"),

    col("position").cast("int").alias("position"),

    col("track_status").cast("string").alias("track_status"),

    col("pit_in_time_s").cast("double").alias("pit_in_time"),
    col("pit_out_time_s").cast("double").alias("pit_out_time"),

    col("is_accurate").cast("boolean").alias("is_accurate"),

    col("air_temp_c").cast("double").alias("air_temp_c"),
    col("humidity_pct").cast("double").alias("humidity_pct"),
    col("pressure_mbar").cast("double").alias("pressure_mbar"),
    col("rainfall").cast("boolean").alias("rainfall"),
    col("track_temp_c").cast("double").alias("track_temp_c"),
    col("wind_direction_deg").cast("double").alias("wind_direction_deg"),
    col("wind_speed_ms").cast("double").alias("wind_speed_ms")
)

# --------------------------------------------------
# JOIN
# --------------------------------------------------

df = lap_telemetry.join(
    l,
    ["session", "driver", "lap"],
    "left"
)

# --------------------------------------------------
# DERIVED FEATURES
# --------------------------------------------------

df = df.withColumn(
    "is_pit_lap",
    when(
        col("pit_in_time").isNotNull() |
        col("pit_out_time").isNotNull(),
        1
    ).otherwise(0)
)

df = df.withColumn(
    "is_push_lap",
    when(
        (col("is_accurate") == True) &
        (col("track_status") == "1") &
        (col("is_pit_lap") == 0),
        1
    ).otherwise(0)
)

df = df.repartition(8)

df.write \
    .mode("overwrite") \
    .parquet(output_path)

print("Rows:", df.count())
print("Output:", output_path)

spark.stop()
