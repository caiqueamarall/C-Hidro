import os
from pymongo import MongoClient
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore

def main():
    print("Iniciando extração das estações da Amazônia Legal...")
    
    # 1. Conectar MongoDB
    MONGO_URL = os.getenv("MONGO_URL", "mongodb://root:root@localhost:27017/")
    try:
        mongo_client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=2000)
        mongo_db = mongo_client["antigravity"]
        print("Conectado ao MongoDB.")
    except Exception as e:
        print(f"Erro Mongo: {e}")
        return
        
    # 2. Conectar Firebase
    try:
        cred = credentials.Certificate('serviceAccountKey.json')
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)
        db = firestore.client()
        print("Conectado ao Firebase.")
    except Exception as e:
        print(f"Erro Firebase: {e}")
        return
        
    raw_estacoes = list(mongo_db["raw_estacoes"].find({}, {
        "_id": 0, "codigo": 1, "nome": 1, "latitude": 1, "longitude": 1,
        "bacia": 1, "rio": 1, "estado": 1, "municipio": 1,
        "anomalia": 1, "cotaUltimaMedicao": 1, "dataHoraUltimaMedicao": 1,
        "statusCota": 1, "cotaRegua": 1, "cotaDataAtual": 1,
        "cotaMaximaHistorica": 1, "zScore": 1
    }))
    
    filtered = []
    for est in raw_estacoes:
        try:
            lat = float(est.get("latitude", 0))
            lon = float(est.get("longitude", 0))
            if -16.0 <= lat <= 6.0 and -74.0 <= lon <= -40.0:
                filtered.append(est)
        except:
            pass
            
    print(f"Total na Amazonia Legal: {len(filtered)} estações.")
    
    batch = db.batch()
    count = 0
    ref = db.collection('api_estacoes')
    
    for est in filtered:
        codigo = str(est.get('codigo'))
        if not codigo: continue
        batch.set(ref.document(codigo), est)
        count += 1
        if count % 400 == 0:
            batch.commit()
            batch = db.batch()
            
    if count % 400 != 0:
        batch.commit()
        
    print(f"SUCESSO! {count} estações foram enviadas para 'api_estacoes'.")

if __name__ == "__main__":
    main()
