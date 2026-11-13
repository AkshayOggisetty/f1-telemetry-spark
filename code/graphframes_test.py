from pyspark.sql import SparkSession
from pyspark.sql.functions import col, count

spark = SparkSession.builder.appName("Graph-DataFrame-Test").getOrCreate()

print("\n==============================")
print("GRAPH TEST USING DATAFRAMES")
print("==============================")

vertices = spark.createDataFrame(
    [
        ("A", "Driver A"),
        ("B", "Driver B"),
        ("C", "Driver C")
    ],
    ["id", "name"]
)

edges = spark.createDataFrame(
    [
        ("A", "B"),
        ("B", "C"),
        ("A", "C"),
        ("A", "B")
    ],
    ["src", "dst"]
)

print("\n=== VERTICES ===")
vertices.show()

print("\n=== EDGES ===")
edges.show()

print("\n=== OUT-DEGREES ===")
edges.groupBy("src").agg(
    count("*").alias("out_degree")
).orderBy(col("out_degree").desc()).show()

print("\n=== IN-DEGREES ===")
edges.groupBy("dst").agg(
    count("*").alias("in_degree")
).orderBy(col("in_degree").desc()).show()

print("\n=== EDGE WEIGHTS ===")
edges.groupBy("src", "dst").agg(
    count("*").alias("weight")
).orderBy(col("weight").desc()).show()

print("\nDATAFRAME GRAPH TEST PASSED")

spark.stop()
