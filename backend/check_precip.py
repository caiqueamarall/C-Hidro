import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import SessionLocal
from models import PrecipitacaoDiaria

db = SessionLocal()
count = db.query(PrecipitacaoDiaria).count()
print(f"Total PrecipitacaoDiaria: {count}")
if count > 0:
    first = db.query(PrecipitacaoDiaria).first()
    print(f"First: {first.codigo_estacao} - {first.data} - {first.chuva}")
