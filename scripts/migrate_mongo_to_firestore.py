import os
import math
from pymongo import MongoClient
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore

def clean_nans(obj):
    if isinstance(obj, dict):
        return {k: clean_nans(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_nans(v) for v in obj]
    elif isinstance(obj, float) and math.isnan(obj):
        return None
    return obj

def main():
    print("Iniciando migração do MongoDB para o Firestore...")
    
    # 1. Configurar MongoDB
    MONGO_URL = os.getenv("MONGO_URL", "mongodb://root:root@localhost:27017/")
    try:
        mongo_client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=2000)
        mongo_client.server_info() # Trigger exception if cannot connect
        mongo_db = mongo_client["antigravity"]
        print("Conectado ao MongoDB local.")
    except Exception as e:
        print(f"Erro ao conectar ao MongoDB: {e}")
        print("Certifique-se de que o Docker com o MongoDB está rodando!")
        return
    
    # 2. Configurar Firebase Admin
    try:
        cred = credentials.Certificate('serviceAccountKey.json')
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        print("Conectado ao Firebase Firestore.")
    except Exception as e:
        print(f"Erro ao conectar ao Firebase: {e}")
        print("Verifique se o serviceAccountKey.json está na raiz do projeto.")
        return
    
    # 3. Migrar 'raw_estacoes' -> 'estacoes'
    estacoes = list(mongo_db["raw_estacoes"].find({}, {"_id": 0}))
    estacoes_ref = db.collection('estacoes')
    print(f"Encontradas {len(estacoes)} estações no MongoDB. Migrando...")
    
    batch = db.batch()
    count = 0
    for est in estacoes:
        est = clean_nans(est)
        codigo = str(est.get('codigo'))
        if not codigo or codigo == "None":
            continue
            
        doc_ref = estacoes_ref.document(codigo)
        batch.set(doc_ref, est)
        count += 1
        
        if count % 400 == 0:
            batch.commit()
            print(f"  -> {count} estações salvas...")
            batch = db.batch()
            
    if count % 400 != 0:
        batch.commit()
        
    print(f"Migração de estações concluída: {count} registros.")
    
    # 4. Migrar 'historico' -> 'historico'
    print("Migrando histórico (pode demorar alguns minutos)...")
    historico = list(mongo_db["historico"].find({}, {"_id": 0}))
    
    batch = db.batch()
    count = 0
    for h in historico:
        h = clean_nans(h)
        codigo = str(h.get('codigo', ''))
        data_med = str(h.get('data', ''))
        
        if not codigo or not data_med:
            continue
            
        # Usamos uma string previsível para não duplicar se rodar o script duas vezes
        # Ex: "17730000_2023-10-01"
        doc_id = f"{codigo}_{data_med[:10]}"
        
        # Referência: root collection 'historico' (simplifica as queries no frontend)
        doc_ref = db.collection('historico').document(doc_id)
        batch.set(doc_ref, h)
        count += 1
        
        if count % 400 == 0:
            batch.commit()
            print(f"  -> {count} registros de histórico salvos...")
            batch = db.batch()
            
    if count % 400 != 0:
        batch.commit()
        
    print(f"Migração de histórico concluída: {count} registros.")
    print("=========================================================")
    print("SUCESSO: Todos os dados foram copiados para o Firebase Firestore!")
    print("=========================================================")

if __name__ == '__main__':
    main()
