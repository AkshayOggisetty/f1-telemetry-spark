from pyspark.sql import SparkSession
from pyspark.sql.functions import col, when
from pyspark.sql.types import *

spark = SparkSession.builder.appName("F1-Corrected-Cleaning").getOrCreate()

INPUT = "hdfs:///bda/f1-telemetry/raw/telemetry.csv"
OUTPUT = "hdfs:///bda/f1-telemetry/processed/cleaned_v2"

schema = StructType([
    StructField("year", IntegerType()),
    StructField("event", StringType()),
    StructField("session", StringType()),
    StructField("driver", StringType()),
    StructField("lap", IntegerType()),
    StructField("time", DoubleType()),
    StructField("rpm", DoubleType()),
    StructField("speed", DoubleType()),
    StructField("gear", IntegerType()),
    StructField("throttle", DoubleType()),
    StructField("brake", IntegerType()),
    StructField("drs", IntegerType()),
    StructField("distance", DoubleType()),
    StructField("rel_distance", DoubleType()),
    StructField("DriverAhead", StringType()),
    StructField("DistanceToDriverAhead", DoubleType()),
    StructField("acc_x", DoubleType()),
    StructField("acc_y", DoubleType()),
    StructField("acc_z", DoubleType()),
    StructField("x", DoubleType()),
    StructField("y", DoubleType()),
    StructField("z", DoubleType())
])

df = spark.read \
    .option("header", True) \
    .schema(schema) \
    .csv(INPUT)

# Corrected cleaning rules
clean = df.filter(
    (col("lap") > 0) &
    (col("speed") >= 5) &
    col("x").isNotNull() &
    col("y").isNotNull() &
    (col("x") != 0) &
    (col("y") != 0) &
    col("brake").isin(0, 1) &
    col("drs").isin(0, 1)
)

# Clamp throttle to physically meaningful range
clean = clean.withColumn(
    "throttle",
    when(col("throttle") < 0, 0)
    .when(col("throttle") > 100, 100)
    .otherwise(col("throttle"))
)

# Invalid gears become NULL
clean = clean.withColumn(
    "gear",
    when((col("gear") >= 0) & (col("gear") <= 8), col("gear"))
    .otherwise(None)
)

# Useful derived features
clean = clean.withColumn(
    "acceleration_magnitude",
    (col("acc_x")**2 + col("acc_y")**2 + col("acc_z")**2)**0.5
)

clean = clean.withColumn(
    "throttle_pct",
    col("throttle")
)

clean = clean.withColumn(
    "braking",
    (col("brake") == 1).cast("int")
)

clean = clean.withColumn(
    "drs_active",
    (col("drs") == 1).cast("int")
)

clean = clean.repartition(12)

print("=== CORRECTED CLEANING ===")
print("Input rows:", df.count())
print("Clean rows:", clean.count())

clean.select(
    "speed", "throttle", "gear", "x", "y"
).describe().show()

clean.write \
    .mode("overwrite") \
    .parquet(OUTPUT)

print("Written to:", OUTPUT)

spark.stop()
