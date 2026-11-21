from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import auth, field, sensor, sensorType

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"status": "ok"}


app.include_router(auth.router, prefix="/auth")
app.include_router(field.router, prefix="/field")
app.include_router(sensor.router, prefix="/sensor")
app.include_router(sensorType.router, prefix="/sensortype")


@app.get("/health")
def health_check():
    return {"status": "ok"}