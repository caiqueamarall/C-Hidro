import requests
import json

# Test EPSG:3857
url_3857 = "https://siger.sipam.gov.br/geoserver/sipam/wms?service=WMS&request=GetMap&layers=sipam:cpc_grade&styles=&format=image/png&transparent=true&version=1.1.1&viewparams=dia:05;mes:08;ano:2026&width=256&height=256&srs=EPSG:3857&bbox=-6261721,-2504688,-5009377,-1252344"
r_3857 = requests.get(url_3857, verify=False)

# Test EPSG:4326
url_4326 = "https://siger.sipam.gov.br/geoserver/sipam/wms?service=WMS&request=GetMap&layers=sipam:cpc_grade&styles=&format=image/png&transparent=true&version=1.1.1&viewparams=dia:05;mes:08;ano:2026&width=256&height=256&srs=EPSG:4326&bbox=-90,11.1,-78.75,21.94"
r_4326 = requests.get(url_4326, verify=False)

with open("test_results.txt", "w") as f:
    f.write(f"EPSG:3857 size: {len(r_3857.content)} bytes\n")
    f.write(f"EPSG:4326 size: {len(r_4326.content)} bytes\n")
