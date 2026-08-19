import requests

url = "https://siger.sipam.gov.br/geoserver/sipam/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=sipam%3Asub_bacias_ottocodificadas&maxFeatures=5000&outputFormat=application%2Fjson"
try:
    r = requests.get(url, verify=False, timeout=15)
    print(r.status_code)
    print(r.text[:500])
except Exception as e:
    print("Error:", e)
