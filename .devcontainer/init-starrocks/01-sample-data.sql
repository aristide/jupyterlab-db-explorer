CREATE DATABASE IF NOT EXISTS testdb;
USE testdb;

CREATE TABLE IF NOT EXISTS countries (
    code CHAR(3),
    name VARCHAR(100),
    population BIGINT,
    area_km2 DECIMAL(12, 2)
)
ENGINE = OLAP
DUPLICATE KEY(code)
DISTRIBUTED BY HASH(code) BUCKETS 1
PROPERTIES ("replication_num" = "1");

INSERT INTO countries VALUES
    ('USA', 'United States', 331900000, 9833520.00),
    ('CHN', 'China', 1412000000, 9596961.00),
    ('IND', 'India', 1408000000, 3287263.00),
    ('BRA', 'Brazil', 214300000, 8515767.00),
    ('NGA', 'Nigeria', 218500000, 923768.00);

CREATE TABLE IF NOT EXISTS indicators (
    id INT,
    country_code CHAR(3),
    indicator_name VARCHAR(100),
    year INT,
    value DECIMAL(15, 4)
)
ENGINE = OLAP
DUPLICATE KEY(id)
DISTRIBUTED BY HASH(id) BUCKETS 1
PROPERTIES ("replication_num" = "1");

INSERT INTO indicators VALUES
    (1, 'USA', 'GDP per capita', 2023, 76330.0000),
    (2, 'CHN', 'GDP per capita', 2023, 12720.0000),
    (3, 'IND', 'GDP per capita', 2023, 2612.0000),
    (4, 'BRA', 'GDP per capita', 2023, 8920.0000),
    (5, 'NGA', 'GDP per capita', 2023, 2184.0000);
