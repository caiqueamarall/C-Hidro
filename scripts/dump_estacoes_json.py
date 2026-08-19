import os
import json
from pymongo import MongoClient

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
    
    # Garantir que a pasta public existe
    os.makedirs('public', exist_ok=True)
    
    # Salvar em um arquivo estático public/estacoes.json
    output_path = os.path.join('public', 'estacoes.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(filtered, f, ensure_ascii=False)
        
    print(f"SUCESSO! O arquivo estático foi criado em '{output_path}'.")

if __name__ == "__main__":
    main()
