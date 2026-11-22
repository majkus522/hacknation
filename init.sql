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
    value FLOAT NOT NULL,
    x FLOAT,
    y FLOAT
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
    21.304768,
    50.317156,
    '181103_2.0022.90/2 (Dąbrówka Osuchowska 90/2)',
    '[{"x": 0.878671, "y": 1.0}, {"x": 0.0, "y": 0.915707}, {"x": 0.218254, "y": 0.0}, {"x": 0.978396, "y": 0.062693}]'
);

INSERT INTO Fields (x, y, name, points)
VALUES (
    21.304529,
    51.316505,
    '142510_5.0010.AR_1.170 (Grabina 170)',
    '[{"x": 0.0, "y": 0.0}, {"x": 0.717056, "y": 0.09754}, {"x": 0.747255, "y": 0.274031}, {"x": 0.851465, "y": 0.800754}, {"x": 0.525912, "y": 1.0}]'
);

INSERT INTO Users (username, email, password) VALUES
('Jan Kowalski', 'rolnik@perun.pl', '$2b$12$wv07EPTxL9qSs4apAKeqFOjQpBdGRxrWgGwugeMUkh0S/MPxlySB2');

INSERT INTO Sensors (fieldId, typeId, value, x, y) VALUES 
(1, 2, 10, 0.4, 0.4),
(1, 2, 10, 0.3, 0.6),
(1, 2, 40, 0.6, 0.1),
(2, 2, 10, 0.3, 0.7),
(2, 2, 10, 0.3, 0.9),
(2, 2, 40, 0.1, 0.9);
