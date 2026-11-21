from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from database import Base

class Log(Base):
    __tablename__ = "logs"

    logid = Column(Integer, primary_key=True, index=True)
    userid = Column(Integer, ForeignKey('users.userid'))
    action = Column(String(100))
    time = Column(DateTime)