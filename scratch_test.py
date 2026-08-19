import requests

def get_token():
    url = 'https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/OAUth/v1'
    headers = {'Identificador': '01763968294', 'Senha': 'cr53pe56'}
    r = requests.get(url, headers=headers)
    return r.text.strip('"')

token = get_token()
print('Token:', token[:10])

def test_ana(range_dias):
    url = f'https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/HidroinfoanaSerieTelemetricaAdotada/v1?Código da Estação=17900000&Tipo Filtro Data=DATA_LEITURA&Range Intervalo de busca={range_dias}'
    headers = {'Authorization': f'Bearer {token}'}
    r = requests.get(url, headers=headers)
    try:
        data = r.json()
        items = data.get('items', [])
        print(f'{range_dias}: {len(items)} items')
    except Exception as e:
        print(f'{range_dias} error:', e, r.status_code, r.text[:200])

test_ana('DIAS_30')
test_ana('DIAS_90')
