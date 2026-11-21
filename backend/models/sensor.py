from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Float
from database import Base

class Sensor(Base):
    __tablename__ = "sensors"

    sensorId = Column(Integer, primary_key=True)
    fieldId = Column(Integer, ForeignKey('fields.fieldId'))
    typeId = Column(Integer, ForeignKey('sensortypes.typeId'))
    value = Column(Float)