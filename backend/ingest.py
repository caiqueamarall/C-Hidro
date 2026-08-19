import requests
import datetime
from sqlalchemy.orm import Session
from database import SessionLocal, engine, mongo_db
import models

models.Base.metadata.create_all(bind=engine)

def fetch_amazon_stations():
    """
    Fetch a list of specific Amazon stations for POC.
    """
    url = "https://apihidro.sipam.gov.br/estacoes/"
    response = requests.get(url)
    if response.status_code == 200:
        estacoes = response.json()
        
        # Debug: print unique basins to see what the API returns
        bacias_unicas = set([e.get('bacia') for e in estacoes if e.get('bacia')])
        print(f"Bacias disponíveis na API: {bacias_unicas}")
        
        # Filter Amazon basin for POC (handling case and accents)
        amazon = [e for e in estacoes if e.get('bacia') and 'amazon' in e.get('bacia').lower()]
        
        # Se ainda assim não achar, trazemos todas como fallback para não ficar vazio
        if len(amazon) == 0:
            print("Nenhuma bacia com nome 'amazon' encontrada. Trazendo limite de 200 como fallback.")
            return estacoes[:200]
            
        return amazon
    return []

def run_ingestion():
    print("Iniciando ingestão de dados...")
    db: Session = SessionLocal()
    
    # 1. Obter estacoes da Bacia Amazonica
    estacoes = fetch_amazon_stations()
    print(f"Encontradas {len(estacoes)} estações na Bacia Amazônica.")
    
    for est in estacoes:
        # Save or update Estacao in PostgreSQL
        # Convert codigo to string because API returns integer and our model is String
        codigo = str(est.get('codigo'))
        
        # Check if exists
        db_est = db.query(models.Estacao).filter(models.Estacao.codigo == codigo).first()
        if not db_est:
            db_est = models.Estacao(
                codigo=codigo,
                nome=est.get('nome'),
                bacia=est.get('bacia'),
                rio=est.get('rio'),
                estado=est.get('estado'),
                municipio=est.get('municipio'),
                latitude=est.get('latitude'),
                longitude=est.get('longitude')
            )
            db.add(db_est)
            db.commit()
        
        # Also store raw payload in MongoDB
        mongo_db["raw_estacoes"].update_one(
            {"codigo": codigo},
            {"$set": est, "$currentDate": {"lastModified": True}},
            upsert=True
        )
        
        # 2. Fetch history (simulated for POC - this would call ANA SOAP API or Sipam history API)
        # We can implement full ANA SOAP fetching here using zeep or requests later
        # print(f"Buscando histórico para {codigo}...")
    
    print("Ingestão base concluída.")
    db.close()

if __name__ == "__main__":
    run_ingestion()
