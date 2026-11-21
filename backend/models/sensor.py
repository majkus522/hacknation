from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Float
from database import Base

class Sensor(Base):
    __tablename__ = "sensors"

    sensorid = Column(Integer, primary_key=True)
    fieldid = Column(Integer, ForeignKey('fields.fieldid'))
    typeid = Column(Integer, ForeignKey('sensortypes.id'))
    value = Column(Float)