import requests
import datetime
from sqlalchemy.orm import Session
from database import SessionLocal
import models
import time

def ingest_chuva_historico():
    print("Iniciando ingestão de dados REAIS de PRECIPITACAO (Chuva) via OPEN-METEO (Dados Espaciais)...")
    db: Session = SessionLocal()
    
    try:
        models.Base.metadata.create_all(bind=db.get_bind())
    except:
        pass
        
    estacoes = db.query(models.Estacao).all()
    if not estacoes:
        print("Nenhuma estação encontrada no banco de dados!")
        return
        
    print("Limpando a tabela PrecipitacaoDiaria...")
    db.query(models.PrecipitacaoDiaria).delete()
    db.commit()
    print("Tabela limpa.")
    
    today_str = datetime.datetime.now().strftime('%Y-%m-%d')
    print(f"Buscando histórico real de CHUVAS de {len(estacoes)} estações (de 01/01/2010 até {today_str})...")
    
    for i, est in enumerate(estacoes):
        print(f"[{i+1}/{len(estacoes)}] Baixando CHUVA (Open-Meteo) p/ {est.codigo} - {est.nome}...")
        
        # ANA stations might lack coordinates in some edge cases, but let's assume they have them.
        if not est.latitude or not est.longitude:
            print(f"⚠️ Estação {est.codigo} sem latitude/longitude. Pulando.")
            continue
            
        url = f"https://archive-api.open-meteo.com/v1/archive"
        params = {
            "latitude": est.latitude,
            "longitude": est.longitude,
            "start_date": "2010-01-01",
            "end_date": today_str,
            "daily": "precipitation_sum",
            "timezone": "America/Sao_Paulo"
        }
        
        try:
            r = requests.get(url, params=params, timeout=60)
            if r.status_code != 200:
                print(f"Erro na API Open-Meteo (status {r.status_code}). Pulando.")
                continue
                
            data = r.json()
            daily_data = data.get("daily", {})
            times = daily_data.get("time", [])
            precips = daily_data.get("precipitation_sum", [])
            
            medicoes_para_inserir = []
            
            for date_str, precip in zip(times, precips):
                if precip is not None:
                    data_medicao = datetime.datetime.strptime(date_str, '%Y-%m-%d')
                    medicoes_para_inserir.append(
                        models.PrecipitacaoDiaria(
                            codigo_estacao=est.codigo,
                            data=data_medicao,
                            chuva=precip
                        )
                    )
                                
            if medicoes_para_inserir:
                # Insert in chunks to avoid blowing up memory
                chunk_size = 5000
                for j in range(0, len(medicoes_para_inserir), chunk_size):
                    db.bulk_save_objects(medicoes_para_inserir[j:j+chunk_size])
                db.commit()
                print(f"✅ Inseridos {len(medicoes_para_inserir)} registros de CHUVA para a estação {est.codigo}.")
            else:
                print(f"⚠️ Nenhum dado de CHUVA retornado para a estação {est.codigo}.")
                
            # Open-Meteo limit is 10000 API calls per day, let's respect it with a tiny sleep
            time.sleep(0.5)
            
        except Exception as e:
            print(f"Erro ao processar estação {est.codigo}: {e}")
            db.rollback()
            
    db.close()
    print("Ingestão de dados de CHUVA (Open-Meteo) concluída com sucesso!")

if __name__ == "__main__":
    ingest_chuva_historico()
