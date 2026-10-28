-- Runs once when the local Postgres volume is created.
CREATE DATABASE private_lessons_test OWNER pl;
\c private_lessons
CREATE EXTENSION IF NOT EXISTS citext;
\c private_lessons_test
CREATE EXTENSION IF NOT EXISTS citext;
