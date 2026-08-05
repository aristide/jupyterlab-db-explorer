-- Create a sample schema and tables for testing
CREATE SCHEMA IF NOT EXISTS sample;

CREATE TABLE IF NOT EXISTS sample.countries (
    code CHAR(3) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    population BIGINT,
    area_km2 NUMERIC(12, 2)
);

INSERT INTO sample.countries (code, name, population, area_km2) VALUES
    ('USA', 'United States', 331900000, 9833520.00),
    ('CHN', 'China', 1412000000, 9596961.00),
    ('IND', 'India', 1408000000, 3287263.00),
    ('BRA', 'Brazil', 214300000, 8515767.00),
    ('NGA', 'Nigeria', 218500000, 923768.00);

CREATE TABLE IF NOT EXISTS sample.indicators (
    id SERIAL PRIMARY KEY,
    country_code CHAR(3) REFERENCES sample.countries(code),
    indicator_name VARCHAR(100),
    year INTEGER,
    value NUMERIC(15, 4)
);

INSERT INTO sample.indicators (country_code, indicator_name, year, value) VALUES
    ('USA', 'GDP per capita', 2023, 76330.0000),
    ('CHN', 'GDP per capita', 2023, 12720.0000),
    ('IND', 'GDP per capita', 2023, 2612.0000),
    ('BRA', 'GDP per capita', 2023, 8920.0000),
    ('NGA', 'GDP per capita', 2023, 2184.0000);
