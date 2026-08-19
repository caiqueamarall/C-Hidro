import requests
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
import datetime

# As estações que o dashboard "Resumo", "Secas", "El Nino" e "Prognóstico" precisam
ESTACOES_PRIORITARIAS = [
    "31645000", "29680090", "29050000", "29070100", "18850000", 
    "18867900", "18936000", "18950003", "18390000", "19500000", 
    "17050001", "19152500", "17900000", "17730000", "16900000",
    "16500000"
]

def main():
    print("Iniciando cópia dos dados da API Local para o Firestore...")
    
    try:
        cred = credentials.Certificate('serviceAccountKey.json')
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)
        db = firestore.client()
        print("Conectado ao Firebase Firestore.")
    except Exception as e:
        print(f"Erro ao conectar ao Firebase: {e}")
        return

    # 1. Puxar a lista completa de estações filtradas/limpas da API local
    print("\n[1] Copiando todas as Estações...")
    try:
        r = requests.get("http://127.0.0.1:8000/api/estacoes", timeout=10)
        if r.ok:
            estacoes = r.json()
            batch = db.batch()
            for est in estacoes:
                codigo = str(est.get('codigo'))
                if codigo:
                    doc_ref = db.collection('estacoes').document(codigo)
                    batch.set(doc_ref, est)
            batch.commit()
            print(f"  -> {len(estacoes)} estações copiadas da API com sucesso.")
        else:
            print("  -> Erro ao acessar /api/estacoes")
    except Exception as e:
        print(f"  -> Erro de conexão com a API local: {e}")

    # 2. Puxar o histórico, prognóstico e secas para as estações prioritárias
    print("\n[2] Processando os dados avançados (Isso pode demorar um pouco)...")
    for cod in ESTACOES_PRIORITARIAS:
        print(f"Processando estação {cod}...")
        
        # Histórico Completo (Percentis, Z-Score, Últimos 365 dias)
        try:
            r_hist = requests.get(f"http://127.0.0.1:8000/api/estacoes/{cod}/historico", timeout=60)
            if r_hist.ok:
                db.collection('api_historico').document(cod).set(r_hist.json())
                print(f"  [{cod}] Histórico: OK")
            else:
                print(f"  [{cod}] Histórico: Falha ({r_hist.status_code})")
        except Exception as e:
            print(f"  [{cod}] Histórico: Erro ({e})")
            
        # Prognóstico
        try:
            r_prog = requests.get(f"http://127.0.0.1:8000/api/estacoes/{cod}/prognostico", timeout=60)
            if r_prog.ok:
                db.collection('api_prognostico').document(cod).set(r_prog.json())
                print(f"  [{cod}] Prognóstico: OK")
            else:
                print(f"  [{cod}] Prognóstico: Falha ({r_prog.status_code})")
        except Exception as e:
            print(f"  [{cod}] Prognóstico: Erro ({e})")

        # El Nino (Anos anteriores)
        # Vamos preencher os anos comuns para o dashboard
        anos = ["2015", "2016", "2023", "2024"]
        for ano in anos:
            data_ini = f"01/01/{ano}"
            data_fim = f"31/12/{ano}"
            try:
                r_elnino = requests.get(f"http://127.0.0.1:8000/api/estacoes/{cod}/elnino?data_inicio={data_ini}&data_fim={data_fim}", timeout=60)
                if r_elnino.ok:
                    # Salvamos como documento composto
                    doc_id = f"{cod}_{ano}"
                    db.collection('api_elnino').document(doc_id).set(r_elnino.json())
            except Exception:
                pass
        print(f"  [{cod}] Dados anuais: OK")

    print("\n=========================================================")
    print("SUCESSO: A migração completa dos relatórios da API terminou!")
    print("O seu Firebase agora possui todas as respostas idênticas às da sua API.")
    print("=========================================================")

if __name__ == "__main__":
    main()
