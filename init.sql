CREATE TABLE Users (
    userId SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    fieldAdmin BOOLEAN DEFAULT FALSE
);

CREATE TABLE SoilTypes (
	id SERIAL PRIMARY KEY,
	name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE Fields (
    fieldId SERIAL PRIMARY KEY,
	name VARCHAR(100) NOT NULL UNIQUE,
    y FLOAT NOT NULL,
    x FLOAT NOT NULL,
    points JSONB NOT NULL
);

CREATE TABLE UserFields (
	id SERIAL PRIMARY KEY,
	userId INT REFERENCES Users(userId),
	fieldId INT REFERENCES Fields(fieldId)
);

CREATE TABLE SensorTypes (
	id SERIAL PRIMARY KEY,
	name VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE Sensors (
    sensorId SERIAL PRIMARY KEY,
    fieldId INT REFERENCES Fields(fieldId),
    typeId INT REFERENCES SensorTypes(id),
    value FLOAT NOT NULL
);

CREATE TABLE Logs (
	logId SERIAL PRIMARY KEY,
	userId INT REFERENCES Users(userId),
	action VARCHAR(100) NOT NULL,
	time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO SoilTypes (name) VALUES
('Gleba brunatna'),
('Gleba płowa'),
('Gleba bielicowa'),
('Gleba rdzawa');

INSERT INTO SensorTypes (name) VALUES
('Czujnik wilgoci'),
('Termometr');

INSERT INTO Fields (x, y, name, points)
VALUES (
    0.42,
    0.68,
    'Pole Tomka',
    '[{"x": 0.0, "y": 0.1}, {"x": 0.85, "y": 0.15}, {"x": 1.0, "y": 0.9}]'
);

INSERT INTO Users (username, email, password) VALUES
('test111', 'test@gmail.com', '$2b$12$T0YYGaopDQg6n.pYbfuNLuFcD1VE9qJx/rJx4QrO8gcpi./usMiWK');

INSERT INTO Sensors (fieldId, typeId, value) VALUES 
(1, 1, 0.4),
(1, 2, 0.5);
