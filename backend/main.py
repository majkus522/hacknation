from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import auth, field
import api.openmeteo as om

app = FastAPI()

app.add_middleware(CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost",
        "http://127.0.0.1",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    om.get_historical_weather_data(52.2297, 21.0122, "2023-01-01", "2023-12-31")
    om.get_forecast_weather_data(52.2297, 21.0122)
    return {"status": "ok"}

app.include_router(auth.router, prefix="/auth")
app.include_router(field.router, prefix="/field")