from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Float
from database import Base

class SensorTypes(Base):
    __tablename__ = "sensortypes"

    id = Column(Integer, primary_key=True)
    name = Column(String)