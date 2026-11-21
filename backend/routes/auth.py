from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from schemas.user import UserCreate, UserLogin
from security import hash_password, verify_password, create_token
from datetime import datetime

router = APIRouter()

@router.post("/register")
def register(user: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user.email).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Konto z takim adresem email już istnieje."
        )

    try:
        new_user = User(
            username=user.username,
            email=user.email,
            password=hash_password(user.password),
            fieldadmin=False
        )

        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return {"msg": "Konto zostało utworzone."}

    except ValueError as e:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    except Exception as e:
        db.rollback()
        print("Błąd rejestracji:", e)
        raise HTTPException(
            status_code=500,
            detail="Wystąpił błąd serwera podczas rejestracji."
        )


@router.post("/login")
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()

    if not db_user:
        raise HTTPException(
            status_code=400,
            detail="Zły email lub hasło."
        )

    if not verify_password(user.password, db_user.password):
        raise HTTPException(
            status_code=400,
            detail="Zły email lub hasło."
        )

    token = create_token(db_user.userid)

    return {
        "access_token": token
    }