from database import engine, Base
import models

def rebuild():
    print("Dropando tabelas antigas...")
    Base.metadata.drop_all(bind=engine)
    print("Recriando tabelas com as novas colunas (latitude e longitude)...")
    Base.metadata.create_all(bind=engine)
    print("Banco de dados resetado com sucesso!")

if __name__ == "__main__":
    rebuild()
