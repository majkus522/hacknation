from sqlalchemy import CheckConstraint, Column, Integer, String
from database import Base

class Crop(Base):
    __tablename__ = "crops"

    crop_id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    I = Column(Integer, nullable=True)
    II = Column(Integer, nullable=True)
    III = Column(Integer, nullable=True)
    IV = Column(Integer, nullable=True)
    V = Column(Integer, nullable=True)
    VI = Column(Integer, nullable=True)
    VII = Column(Integer, nullable=True)
    VIII = Column(Integer, nullable=True)
    IX = Column(Integer, nullable=True)
    X = Column(Integer, nullable=True)
    XI = Column(Integer, nullable=True)
    XII = Column(Integer, nullable=True)
    consumption_from = Column(Integer, nullable=True)
    consumption_to = Column(Integer, nullable=True)

    __table_args__ = (
        CheckConstraint(
            """
            consumption_from IS NULL
            OR consumption_to IS NULL
            OR consumption_from <= consumption_to
            """,
            name="check_crop_consumption"
        ),
    )