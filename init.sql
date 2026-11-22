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

CREATE TABLE Crops (
    crop_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,

    "I" SMALLINT,
    "II" SMALLINT,
    "III" SMALLINT,
    "IV" SMALLINT,
    "V" SMALLINT,
    "VI" SMALLINT,
    "VII" SMALLINT,
    "VIII" SMALLINT,
    "IX" SMALLINT,
    "X" SMALLINT,
    "XI" SMALLINT,
    "XII" SMALLINT,

    consumption_from SMALLINT,
    consumption_to SMALLINT,

    CHECK (
        consumption_from IS NULL
        OR consumption_to IS NULL
        OR consumption_from <= consumption_to
    )
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
(1, 2, 10, 0.1, 0.8),
(1, 2, 10, 0.8, 0.8),
(1, 2, 40, 0.6, 0.2),
(2, 2, 10, 0.3, 0.2),
(2, 2, 10, 0.7, 0.8),
(2, 2, 40, 0.5, 0.5);

INSERT INTO crops (
    crop_id,
    name,
    "IV", "V", "VI", "VII", "VIII", "IX",
    consumption_from,
    consumption_to
)
VALUES
(
    1,
    'Pszenica ozima',
    35, 65, 70, 60, NULL, NULL,
    500, 600
),
(
    2,
    'Pszenica jara',
    45, 65, 75, 65, NULL, NULL,
    500, 600
),
(
    3,
    'Żyto',
    35, 70, 70, 45, NULL, NULL,
    400, 500
),
(
    4,
    'Rzepak ozimy',
    50, 70, 75, 30, NULL, NULL,
    600, 700
),
(
    5,
    'Kukurydza',
    NULL, 50, 60, 70, 65, 50,
    300, 400
),
(
    6,
    'Burak cukrowy',
    15, 65, 74, 85, 78, 54,
    350, 450
),
(
    7,
    'Trwałe użytki zielone',
    50, 70, 90, 100, 80, 60,
    NULL, NULL
);
