import requests
import xml.etree.ElementTree as ET

url = 'http://telemetriaws1.ana.gov.br/ServiceANA.asmx/HidroSerieHistorica'
params = {
    'codEstacao': '18850000',
    'dataInicio': '01/01/2026',
    'dataFim': '31/01/2026',
    'tipoDados': '1',
    'nivelConsistencia': ''
}

r = requests.get(url, params=params)
if r.status_code == 200:
    print(r.text[:1000])
    
    root = ET.fromstring(r.content)
    namespace = {'ana': 'http://tempuri.org/'}
    
    # Just print the first serie
    for serie in root.findall('.//SerieHistorica', namespace):
        data = serie.find('DataHora').text if serie.find('DataHora') is not None else ''
        print(f"Mes: {data}")
        # find day 1
        d1 = serie.find('Cota01').text if serie.find('Cota01') is not None else 'null'
        print(f"Cota01: {d1}")
        break
else:
    print("Error", r.status_code)
