from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from database import get_db
from models.logs import Log
from models.user import User
from schemas.user import UserCreate, UserLogin
import security
from security import hash_password, verify_password, create_token
import os

try:
    import jwt
except ImportError:
    from jose import jwt

router = APIRouter()

SECRET_KEY = getattr(
    security, "SECRET_KEY", os.getenv("SECRET_KEY", "supersecretkey")
)
ALGORITHM = getattr(
    security, "ALGORITHM", os.getenv("ALGORITHM", "HS256")
)


def serialize_user(db_user: User) -> dict:
    return {
        "userid": db_user.userid,
        "username": db_user.username,
        "email": db_user.email,
        "fieldadmin": bool(db_user.fieldadmin),
    }


def get_current_user(
    authorization: str = Header(None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Brak tokenu autoryzacji.")

    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub") or payload.get("userid")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Nieprawidłowy token.")
    except Exception:
        raise HTTPException(
            status_code=401, detail="Token wygasł lub jest nieprawidłowy."
        )

    db_user = db.query(User).filter(User.userid == int(user_id)).first()
    if not db_user:
        raise HTTPException(status_code=401, detail="Użytkownik nie istnieje.")
    return db_user


@router.post("/register")
def register(user: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user.email).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Konto z takim adresem email już istnieje.",
        )

    try:
        new_user = User(
            username=user.username,
            email=user.email,
            password=hash_password(user.password),
            fieldadmin=False,
        )

        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        token = create_token(new_user.userid)
        return {
            "msg": "Konto zostało utworzone.",
            "access_token": token,
            "token_type": "bearer",
            "user": serialize_user(new_user),
        }

    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    except Exception as e:
        db.rollback()
        print("Błąd rejestracji:", e)
        raise HTTPException(
            status_code=500,
            detail="Wystąpił błąd serwera podczas rejestracji.",
        )


@router.post("/login")
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()

    if not db_user:
        raise HTTPException(
            status_code=400,
            detail="Zły email lub hasło.",
        )

    if not verify_password(user.password, db_user.password):
        raise HTTPException(
            status_code=400,
            detail="Zły email lub hasło.",
        )

    token = create_token(db_user.userid)

    log = Log(userid=db_user.userid, action="login", time=datetime.utcnow())
    db.add(log)
    db.commit()

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": serialize_user(db_user),
    }

@router.post("/logout")
def login(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    log = Log(userid = current_user.userid, action = "logout", time = datetime.utcnow())
    db.add(log)
    db.commit()


@router.get("/me")
def read_current_user(current_user: User = Depends(get_current_user)):
    return serialize_user(current_user)