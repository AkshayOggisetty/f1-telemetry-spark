#!/bin/bash

# F1 Race Telemetry Analytics
# Apache Spark 4.0.4 on Hadoop YARN

SPARK_CONF="--master yarn \
--deploy-mode client \
--conf spark.yarn.archive=hdfs:///spark-jars/spark-jars.zip \
--conf spark.executor.instances=3 \
--conf spark.executor.cores=2 \
--conf spark.executor.memory=2g"

echo "1. Cleaning telemetry"
spark-submit $SPARK_CONF ~/bda_project/code/f1_clean_v2.py

echo "2. Building lap features"
spark-submit $SPARK_CONF ~/bda_project/code/f1_lap_features_v2.py

echo "2b. Fastest laps, race positions and stints"
spark-submit $SPARK_CONF ~/bda_project/code/f1_step5_tables.py

echo "3. Tyre degradation"
spark-submit $SPARK_CONF ~/bda_project/code/f1_tyre_degradation.py

echo "4. Next-lap prediction"
spark-submit $SPARK_CONF ~/bda_project/code/f1_next_lap_prediction_v2.py

echo "5. Driver clustering"
spark-submit $SPARK_CONF ~/bda_project/code/f1_kmeans_v2.py

echo "6. Anomaly detection"
spark-submit $SPARK_CONF ~/bda_project/code/f1_anomaly_detection_v2.py

echo "7. Graph test"
spark-submit $SPARK_CONF ~/bda_project/code/graphframes_test.py

echo "8. Chase graph"
spark-submit $SPARK_CONF ~/bda_project/code/f1_chase_graph.py

echo "9. Final CSV/JSON exports"
spark-submit $SPARK_CONF ~/bda_project/code/export_tables.py

echo "10. Export Random Forest for the website predictor"
spark-submit $SPARK_CONF ~/bda_project/code/f1_export_rf_model.py \
  ~/bda_project/f1_dashboard_data/model_export/next_lap_rf.json
