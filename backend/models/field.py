from sqlalchemy import Column, Integer, String, Float
from sqlalchemy.dialects.postgresql import JSONB
from database import Base


class Field(Base):
    __tablename__ = "fields"

    fieldid = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    y = Column(Float, nullable=False)
    x = Column(Float, nullable=False)
    points = Column(JSONB, nullable=False)