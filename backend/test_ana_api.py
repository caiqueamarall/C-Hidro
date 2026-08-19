import requests
import json

IDENTIFICADOR = '01763968294'
SENHA = 'cr53pe56'

# Get token
print("Getting token...")
r = requests.get('https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/OAUth/v1', headers={
    'Identificador': IDENTIFICADOR,
    'Senha': SENHA
})
token = r.json().get('items', {}).get('tokenautenticacao')
print("Token:", token[:10] + "...")

# Fetch 1 year of data for Altamira (18850000)
print("Fetching data...")
params = {
    'Código da Estação': '18850000',
    'Tipo Filtro Data': 'DATA_LEITURA',
    'Data de Busca (yyyy-MM-dd)': '2024-01-01',
    'Range Intervalo de busca': 'DIAS_30'
}
r2 = requests.get('https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/HidroinfoanaSerieTelemetricaAdotada/v1', 
    headers={'Authorization': f'Bearer {token}'}, 
    params=params
)
if r2.status_code == 200:
    items = r2.json().get('items', [])
    print(f"Got {len(items)} items for 30 days.")
    if items:
        print(items[0])
else:
    print("Error:", r2.status_code)
