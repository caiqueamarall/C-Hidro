import requests

try:
    r = requests.get("http://localhost:8000/api/estacoes")
    print(r.status_code)
    print(str(r.content)[:500])
except Exception as e:
    print("Erro:", e)
