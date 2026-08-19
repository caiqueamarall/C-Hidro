import requests
import json
import os

def main():
    print("Iniciando extração das estações da API Sipam...")
    url = "https://apihidro.sipam.gov.br/estacoes/"
    
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
    except Exception as e:
        print(f"Erro ao acessar API Sipam: {e}")
        return
        
    estacoes = response.json()
    filtered = []
    
    for est in estacoes:
        try:
            lat = float(est.get("latitude", 0))
            lon = float(est.get("longitude", 0))
            # Filtro para a região da Amazônia Legal
            if -16.0 <= lat <= 6.0 and -74.0 <= lon <= -40.0:
                filtered.append(est)
        except Exception:
            pass
            
    print(f"Total na Amazonia Legal filtradas: {len(filtered)} estações.")
    
    # Garantir que a pasta public existe
    os.makedirs('public', exist_ok=True)
    
    output_path = os.path.join('public', 'estacoes.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(filtered, f, ensure_ascii=False)
        
    print(f"SUCESSO! O arquivo foi gerado e salvo em '{output_path}'.")

if __name__ == "__main__":
    main()
