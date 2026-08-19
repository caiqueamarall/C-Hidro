import datetime
import random
from sqlalchemy.orm import Session
from database import SessionLocal
import models

def seed_historico():
    print("Iniciando geração de histórico simulado (POC)...")
    db: Session = SessionLocal()
    
    # Pegar todas as estações (para a POC completa)
    estacoes = db.query(models.Estacao).all()
    
    if not estacoes:
        print("Nenhuma estação encontrada no banco de dados!")
        return
        
    print(f"Gerando dados para {len(estacoes)} estações...")
    
    today = datetime.datetime.now()
    
    for est in estacoes:
        print(f"Semeando estação {est.codigo} - {est.nome}")
        
        # Gerar 10 anos de dados (3650 dias) para testar percentis reais
        base_cota = 500.0
        
        medicoes_para_inserir = []
        for i in range(3650):
            dia = today - datetime.timedelta(days=i)
            
            # Criar variação sazonal baseada no mês (chuvas na amazônia)
            mes = dia.month
            if mes in [3, 4, 5, 6]: # Cheia
                base_cota += random.uniform(-1, 3)
            elif mes in [9, 10, 11]: # Seca
                base_cota += random.uniform(-3, 1)
            else:
                base_cota += random.uniform(-2, 2)
                
            # Evitar cota negativa extrema
            if base_cota < 100:
                base_cota = 100
            if base_cota > 2000:
                base_cota = 2000
                
            medicoes_para_inserir.append(
                models.MedicaoDiaria(
                    codigo_estacao=est.codigo,
                    data=dia,
                    cota=round(base_cota, 2),
                    vazao=round(base_cota * 1.5, 2)
                )
            )
            
        # Bulk insert para ser rápido
        db.bulk_save_objects(medicoes_para_inserir)
        db.commit()
        print(f"✅ Inseridos 3650 registros para a estação {est.codigo}.")
        
    print("Seed concluído!")
    db.close()

if __name__ == "__main__":
    seed_historico()
