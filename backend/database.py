from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from pymongo import MongoClient
import os

# PostgreSQL Configuration
SQLALCHEMY_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/antigravity"

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# MongoDB Configuration
# Puxa a URL da nuvem se existir, senão usa o banco local do Docker
MONGO_URL = os.getenv("MONGO_URL", "mongodb://root:root@localhost:27017/")
mongo_client = MongoClient(MONGO_URL)
mongo_db = mongo_client["antigravity"]

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
