from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Float
from database import Base

class SoilType(Base):
    __tablename__ = "soiltypes"

    id = Column(Integer, primary_key=True)
    name = Column(String)