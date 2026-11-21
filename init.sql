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
    name VARCHAR(100) NOT NULL,
    size FLOAT NOT NULL,
    soilType INT REFERENCES SoilTypes(id)
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

INSERT INTO SoilTypes (name) VALUES
('Gleba brunatna'),
('Gleba płowa'),
('Gleba bielicowa'),
('Gleba rdzawa');

INSERT INTO SensorTypes (name) VALUES
('Czujnik wilgoci'),
('Termometr');

INSERT INTO Fields (name, size, soilType) VALUES
('ggfd', 2.43, 2),
('tgfgfd', 0.43, 3);

INSERT INTO Users (username, email, password) VALUES
('test111', 'test@gmail.com', '$2b$12$T0YYGaopDQg6n.pYbfuNLuFcD1VE9qJx/rJx4QrO8gcpi./usMiWK');

INSERT INTO Sensors (fieldId, typeId, value) VALUES 
(1, 1, 0.4),
(1, 1, 0.5),
(2, 1, 0.6);
