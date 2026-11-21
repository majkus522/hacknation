from pydantic import BaseModel

class FieldCreate(BaseModel):
    name: str
    size: float