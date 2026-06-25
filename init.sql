-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Define Enums for static constraints
CREATE TYPE map_type_enum AS ENUM ('UPLOAD', 'CANVAS');
CREATE TYPE severity_enum AS ENUM ('MINOR', 'MODERATE', 'URGENT');
CREATE TYPE status_enum AS ENUM ('OPEN', 'CLOSED');

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Projects Table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    address TEXT,
    client_name VARCHAR(255),
    magic_link_token VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Maps / Floors Table
CREATE TABLE IF NOT EXISTS maps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    map_type map_type_enum NOT NULL,
    background_image_url TEXT,
    canvas_json_data JSONB, -- JSONB is better than JSON in postgres for querying/performance
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pins Table (Issues)
CREATE TABLE IF NOT EXISTS pins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    x_coordinate FLOAT NOT NULL,
    y_coordinate FLOAT NOT NULL,
    severity severity_enum DEFAULT 'MINOR',
    status status_enum DEFAULT 'OPEN',
    text_note TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Photos Table
CREATE TABLE IF NOT EXISTS photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pin_id UUID NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);