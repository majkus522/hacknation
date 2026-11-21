from pydantic import BaseModel

class Sensor(BaseModel):
    type: int
    value: float