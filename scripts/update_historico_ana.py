import requests
import json
import os
import time
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

ANA_IDENTIFICADOR = '01763968294'
ANA_SENHA = 'cr53pe56'

def get_ana_token():
    print("Obtendo token da ANA...")
    for attempt in range(5):
        try:
            auth_resp = requests.get(
                'https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/OAUth/v1',
                headers={'Identificador': ANA_IDENTIFICADOR, 'Senha': ANA_SENHA},
                verify=False,
                timeout=30
            )
            if auth_resp.ok:
                return auth_resp.json().get('items', {}).get('tokenautenticacao')
        except Exception as e:
            print(f"Erro no token (tentativa {attempt+1}/5): {e}")
        time.sleep(3)
    return None

def main():
    historico_dir = os.path.join('public', 'historico')
    os.makedirs(historico_dir, exist_ok=True)
    
    estacoes_path = os.path.join('public', 'estacoes.json')
    if not os.path.exists(estacoes_path):
        print("Arquivo estacoes.json não encontrado. Rode update_estacoes.py primeiro.")
        return
        
    with open(estacoes_path, 'r', encoding='utf-8') as f:
        estacoes = json.load(f)
        
    print(f"Lidas {len(estacoes)} estações para buscar histórico.")
    
    token = get_ana_token()
    if not token:
        print("Falha ao obter token da ANA. Abortando.")
        return
        
    url = 'https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/HidroinfoanaSerieTelemetricaAdotada/v1'
    
    import datetime
    hoje = datetime.datetime.now()
    
    success_count = 0
    
    for i, est in enumerate(estacoes):
        codigo = str(est.get('codigo'))
        if not codigo or codigo == "None": continue
        
        print(f"[{i+1}/{len(estacoes)}] Buscando {codigo} em blocos de 14 dias...")
        
        all_items = []
        # Fazer 3 iterações de 14 dias para cobrir 42 dias (suficiente para Prognóstico e Boletins)
        for chunk in range(3):
            data_busca = (hoje - datetime.timedelta(days=14 * (chunk + 1))).strftime('%Y-%m-%d')
            
            params = {
                'Código da Estação': codigo,
                'Tipo Filtro Data': 'DATA_LEITURA',
                'Range Intervalo de busca': 'DIAS_14',
                'Data de Busca (yyyy-MM-dd)': data_busca
            }
            
            # Retry mechanism for robustness
            retries = 3
            chunk_items = []
            for attempt in range(retries):
                try:
                    resp = requests.get(url, params=params, headers={'Authorization': f'Bearer {token}'}, verify=False, timeout=20)
                    if resp.ok:
                        data = resp.json()
                        if 'items' in data:
                            chunk_items = data['items']
                        break
                    elif resp.status_code == 401:
                        print("    -> Token expirado (Erro 401). Renovando token...")
                        token = get_ana_token()
                        if not token:
                            print("    -> Falha ao renovar token. Abortando estação.")
                            break
                    else:
                        print(f"    -> Erro {resp.status_code} na data {data_busca}. Mensagem: {resp.text[:50]}... Tentando novamente...")
                except Exception as e:
                    print(f"    -> Exceção {e}")
                time.sleep(2)
                
            all_items.extend(chunk_items)
            
        if all_items:
            out_file = os.path.join(historico_dir, f"{codigo}.json")
            with open(out_file, 'w', encoding='utf-8') as fw:
                json.dump(all_items, fw, ensure_ascii=False)
            success_count += 1
        else:
            print(f"    -> Falha ao processar {codigo} (sem dados)")
            
        time.sleep(1) # Be nice to the API
        
    print(f"Finalizado. {success_count} históricos baixados com sucesso.")

if __name__ == "__main__":
    main()
