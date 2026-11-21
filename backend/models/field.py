from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Float
from database import Base

class Field(Base):
    __tablename__ = "fields"

    fieldid = Column(Integer, primary_key=True)
    name = Column(String)
    size = Column(Float)