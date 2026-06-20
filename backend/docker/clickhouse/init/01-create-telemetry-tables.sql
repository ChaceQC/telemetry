CREATE DATABASE IF NOT EXISTS telemetry;

CREATE TABLE IF NOT EXISTS telemetry.metric_samples
(
    project_id UInt64,
    api_key_id UInt64,
    timestamp DateTime64(3, 'UTC'),
    received_at DateTime64(3, 'UTC') DEFAULT now64(3),
    name LowCardinality(String),
    value Float64,
    unit LowCardinality(String) DEFAULT '',
    metric_type LowCardinality(String) DEFAULT '',
    source LowCardinality(String) DEFAULT '',
    tags_json String DEFAULT '{}',
    attributes_json String DEFAULT '{}',
    payload_json String DEFAULT '{}'
)
ENGINE = MergeTree
PARTITION BY toDate(timestamp)
ORDER BY (project_id, name, timestamp);

CREATE TABLE IF NOT EXISTS telemetry.log_records
(
    project_id UInt64,
    api_key_id UInt64,
    timestamp DateTime64(3, 'UTC'),
    received_at DateTime64(3, 'UTC') DEFAULT now64(3),
    level LowCardinality(String),
    source LowCardinality(String) DEFAULT '',
    logger String DEFAULT '',
    trace_id String DEFAULT '',
    span_id String DEFAULT '',
    message String,
    attributes_json String DEFAULT '{}',
    payload_json String DEFAULT '{}'
)
ENGINE = MergeTree
PARTITION BY toDate(timestamp)
ORDER BY (project_id, level, source, timestamp);

CREATE TABLE IF NOT EXISTS telemetry.ingest_stats
(
    bucket_start DateTime64(3, 'UTC'),
    project_id UInt64,
    api_key_id UInt64,
    kind LowCardinality(String),
    source LowCardinality(String) DEFAULT '',
    accepted_count UInt64 DEFAULT 0,
    rejected_count UInt64 DEFAULT 0,
    bytes_count UInt64 DEFAULT 0,
    reason LowCardinality(String) DEFAULT '',
    attributes_json String DEFAULT '{}'
)
ENGINE = MergeTree
PARTITION BY toDate(bucket_start)
ORDER BY (project_id, bucket_start, kind, source);

CREATE TABLE IF NOT EXISTS telemetry.trace_spans
(
    project_id UInt64,
    api_key_id UInt64,
    trace_id String,
    span_id String,
    parent_span_id String DEFAULT '',
    name String,
    start_time DateTime64(3, 'UTC'),
    end_time Nullable(DateTime64(3, 'UTC')),
    duration_ms Nullable(Float64),
    status_code LowCardinality(String) DEFAULT '',
    source LowCardinality(String) DEFAULT '',
    attributes_json String DEFAULT '{}',
    payload_json String DEFAULT '{}',
    received_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
PARTITION BY toDate(start_time)
ORDER BY (project_id, trace_id, start_time, name);
