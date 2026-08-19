import requests
import json

identificador = "01763968294"
senha = "cr53pe56"

# 1. Auth
auth_url = "https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/OAUth/v1"
headers = {
    "Identificador": identificador,
    "Senha": senha
}
r1 = requests.get(auth_url, headers=headers)
if not r1.ok:
    print("Auth failed", r1.status_code)
    exit()

token = r1.json()["items"]["tokenautenticacao"]

# 2. Fetch
data_url = "https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/HidroinfoanaSerieTelemetricaAdotada/v1"
params = {
    "Código da Estação": "29050000",
    "Tipo Filtro Data": "DATA_LEITURA",
    "Range Intervalo de busca": "DIAS_14"
}
h2 = {
    "Authorization": f"Bearer {token}"
}
r2 = requests.get(data_url, params=params, headers=h2)
if not r2.ok:
    print("Data failed", r2.status_code)
    exit()

data = r2.json()
if "items" in data and len(data["items"]) > 0:
    print(json.dumps(data["items"][0], indent=2))
else:
    print("No items")
