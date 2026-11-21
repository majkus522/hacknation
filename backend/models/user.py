from sqlalchemy import Column, Integer, String, Boolean
from database import Base

class User(Base):
    __tablename__ = "users"

    userid = Column(Integer, primary_key=True)
    username = Column(String)
    email = Column(String)
    password = Column(String)
    fieldadmin = Column(Boolean)