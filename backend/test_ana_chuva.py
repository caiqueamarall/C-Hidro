import requests
import xml.etree.ElementTree as ET

url = 'http://telemetriaws1.ana.gov.br/ServiceANA.asmx/HidroSerieHistorica'

def check_station(code):
    print(f"Checking {code}...")
    params = {
        'codEstacao': code,
        'dataInicio': '01/01/2010',
        'dataFim': '',
        'tipoDados': '2',
        'nivelConsistencia': '' 
    }
    r = requests.get(url, params=params)
    if 'SerieHistorica' in r.text:
        print(f"✅ FOUND data for {code}!")
    else:
        print(f"❌ No data for {code}")

# Fluviometric code
check_station('15320002')
# Pluviometric code (usually 7 digits, starting with state/basin, e.g., 01532002 or 1532002)
check_station('01532002')
check_station('1532002')
check_station('828000') # Test known pluviometric
