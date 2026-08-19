import requests
import re
from urllib.parse import urljoin

base_url = 'https://hidro.sipam.gov.br'
res = requests.get(base_url + '/map', verify=False)
html = res.text

# Find script src
scripts = re.findall(r'<script[^>]+src="([^"]+)"', html)

for src in scripts:
    url = urljoin(base_url, src)
    print(f"Checking {url}")
    js_res = requests.get(url, verify=False)
    js = js_res.text
    
    # Find anything looking like a URL with wms or geoserver
    matches = re.findall(r'(https?://[^"\']*(?:wms|geoserver|cptec|inpe|ows)[^"\']*)', js, re.IGNORECASE)
    for m in set(matches):
        print("FOUND URL:", m)
