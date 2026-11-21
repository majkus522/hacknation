from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import auth, field

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
    return {"status": "ok"}

app.include_router(auth.router, prefix="/auth")
app.include_router(field.router, prefix="/field")