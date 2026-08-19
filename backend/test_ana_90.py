import requests
import json

try:
    login = requests.get('http://localhost:8000/api/ana/acessotoken').json()
    token = login.get('access_token')
    
    url = 'http://localhost:8000/api/ana/EstacoesTelemetricas/HidroinfoanaSerieTelemetricaAdotada/v1'
    params = {
        'Código da Estação': '29050000',
        'Tipo Filtro Data': 'DATA_LEITURA',
        'Range Intervalo de busca': 'DIAS_90'
    }
    
    headers = {'Authorization': f'Bearer {token}'}
    res = requests.get(url, params=params, headers=headers)
    
    try:
        data = res.json()
        print("Result length:", len(data))
        if len(data) > 0:
            print("First:", data[0])
            print("Last:", data[-1])
        else:
            print("Error or empty:", data)
    except Exception as je:
        print("Not json! text:", res.text)
except Exception as e:
    print("Error:", e)
