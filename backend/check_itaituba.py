import urllib.request
import json
import urllib.parse
from datetime import datetime, timedelta

def authenticate():
    url = "https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/OAUth/v1"
    headers = {
        'Identificador': '01763968294',
        'Senha': 'cr53pe56'
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            return data.get('items', {}).get('tokenautenticacao')
    except Exception as e:
        print(f"Auth failed: {e}")
        return None

def fetch_data(token, station, data_busca):
    url = "https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/HidroinfoanaSerieTelemetricaAdotada/v1"
    params = urllib.parse.urlencode({
        'Código da Estação': str(station),
        'Tipo Filtro Data': 'DATA_LEITURA',
        'Range Intervalo de busca': 'DIAS_30',
        'Data de Busca (yyyy-MM-dd)': data_busca
    })
    
    full_url = f"{url}?{params}"
    headers = {'Authorization': f'Bearer {token}'}
    req = urllib.request.Request(full_url, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            return data.get('items', [])
    except Exception as e:
        print(f"Fetch failed for {data_busca}: {e}")
        return []

def main():
    token = authenticate()
    if not token:
        print("Could not get token.")
        return
        
    station = 17730000 # Itaituba
    dates_to_fetch = ['2023-11-30', '2023-10-30', '2023-09-30']
    
    all_data = []
    for d in dates_to_fetch:
        items = fetch_data(token, station, d)
        all_data.extend(items)
        
    print(f"Total items fetched for {station} between Sep-Nov 2023: {len(all_data)}")
    
    # Let's count how many items actually fall within Sep-Nov 2023 and have a valid Cota
    valid_count = 0
    for item in all_data:
        date_str = item.get('Data_Hora_Medicao')
        if not date_str:
            continue
        try:
            cota = float(item.get('Cota_Sensor') or item.get('Cota_Adotada') or 0)
        except ValueError:
            cota = 0
            
        if cota > 0:
            month = date_str[5:7]
            year = date_str[0:4]
            if year == '2023' and month in ['09', '10', '11']:
                valid_count += 1
                
    print(f"Total valid readings between Sep and Nov 2023: {valid_count}")
    if valid_count > 0:
        print("Example of a reading:")
        for item in all_data:
            date_str = item.get('Data_Hora_Medicao')
            if date_str and date_str.startswith('2023-10'):
                print(item)
                break

if __name__ == "__main__":
    main()
