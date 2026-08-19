from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import pandas as pd
import numpy as np

from database import engine, get_db, Base
import models

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="SGB Antigravity Backend (Fase 2)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], # Specific origins needed for credentials=True
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.concurrency import run_in_threadpool
import asyncio
from ingest import run_ingestion
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

FastAPIInstrumentor.instrument_app(app)

async def periodic_ingest():
    # Aguarda 5 segundos antes da primeira execucao para a API subir tranquila
    await asyncio.sleep(5)
    while True:
        try:
            print("Executando atualização automática do SIPAM (Background)...")
            await run_in_threadpool(run_ingestion)
            print("Atualização automática concluída! Próxima em 6 horas.")
        except Exception as e:
            print(f"Erro na atualização automática: {e}")
        
        # Espera 6 horas (6 * 3600 segundos)
        await asyncio.sleep(6 * 3600)

ingest_task = None

@app.on_event("startup")
async def startup_event():
    global ingest_task
    ingest_task = asyncio.create_task(periodic_ingest())

@app.on_event("shutdown")
async def shutdown_event():
    global ingest_task
    if ingest_task:
        ingest_task.cancel()

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Backend SGB Antigravity running"}

@app.get("/api/estacoes")
def get_estacoes():
    from database import mongo_db
    # Read from MongoDB to get the exact original JSON from Sipam, excluding huge arrays
    projection = {
        "_id": 0,
        "codigo": 1, "nome": 1, "latitude": 1, "longitude": 1,
        "bacia": 1, "rio": 1, "estado": 1, "municipio": 1,
        "anomalia": 1, "cotaUltimaMedicao": 1, "dataHoraUltimaMedicao": 1,
        "statusCota": 1, "cotaRegua": 1, "cotaDataAtual": 1,
        "cotaMaximaHistorica": 1, "zScore": 1
    }
    # Fetch all and filter in Python to avoid MongoDB data type issues (strings vs floats)
    raw_estacoes = list(mongo_db["raw_estacoes"].find({}, projection))
    
    filtered_estacoes = []
    for est in raw_estacoes:
        try:
            lat = float(est.get("latitude", 0))
            lon = float(est.get("longitude", 0))
            # Amazonia Legal bounding box
            if -16.0 <= lat <= 6.0 and -74.0 <= lon <= -40.0:
                filtered_estacoes.append(est)
        except (ValueError, TypeError):
            pass
            
    # If for some reason the above returns empty, try to get all but limit to prevent UI crash
    if not filtered_estacoes:
        filtered_estacoes = raw_estacoes[:200]
        
    if not filtered_estacoes:
        # Diagnostic fallback: if MongoDB is literally empty, return one dummy station 
        # so the map doesn't crash and we know the API is alive!
        filtered_estacoes = [{
            "codigo": "DIAGNOSTIC",
            "nome": "⚠️ BANCO DE DADOS VAZIO",
            "latitude": -3.1,
            "longitude": -60.0,
            "bacia": "Amazonas",
            "anomalia": "NORMALIDADE",
            "zScore": 0.0
        }]
        
    # Protect against any NaN values across all fields that cause JSON parse errors in the frontend
    import math
    def clean_nans(obj):
        if isinstance(obj, dict):
            return {k: clean_nans(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [clean_nans(v) for v in obj]
        elif isinstance(obj, float) and math.isnan(obj):
            return None
        return obj
        
    return clean_nans(filtered_estacoes)

@app.get("/api/fix-estados")
def fix_estados():
    from database import mongo_db
    import requests
    import xml.etree.ElementTree as ET
    
    ufs = ['PA', 'MA', 'PI', 'AP']
    updated = 0
    total_ana = 0
    errors = []
    for uf in ufs:
        url = f'http://telemetriaws1.ana.gov.br/ServiceANA.asmx/HidroInventario?codEstTelemetrica=&bacia=&nmEstacao=&tipoEstacao=&siglaRio=&estado={uf}'
        try:
            r = requests.get(url, timeout=30)
            root = ET.fromstring(r.text)
            for row in root.iter('Table'):
                codigo_element = row.find('Codigo')
                if codigo_element is not None and codigo_element.text:
                    total_ana += 1
                    codigo = int(codigo_element.text)
                    result = mongo_db["raw_estacoes"].update_one(
                        {"codigo": codigo},
                        {"$set": {"estado": uf}}
                    )
                    if result.modified_count > 0:
                        updated += 1
        except Exception as e:
            errors.append(f"{uf}: {str(e)}")
            
    return {"status": "success", "updated": updated, "total_ana": total_ana, "errors": errors}

@app.get("/api/count-stations")
def count_stations():
    from database import mongo_db
    return {"count": mongo_db["raw_estacoes"].count_documents({})}
@app.get("/api/debug")
def get_debug(db: Session = Depends(get_db)):
    import models
    estacoes = db.query(models.Estacao).limit(10).all()
@app.get("/api/patch-estados/{uf}")
def patch_estados(uf: str, db: Session = Depends(get_db)):
    import requests
    import xml.etree.ElementTree as ET
    import models
    try:
        url = f'http://telemetriaws1.ana.gov.br/ServiceANA.asmx/HidroInventario?codEstTelemetrica=&bacia=&nmEstacao=&tipoEstacao=&siglaRio=&estado={uf}'
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        r = requests.get(url, headers=headers, timeout=60)
        root = ET.fromstring(r.text)
        count = 0
        for row in root.iter():
            if 'Table' in row.tag:
                codigo_el = None
                for child in row:
                    if 'Codigo' in child.tag:
                        codigo_el = child
                        break
                if codigo_el is not None and codigo_el.text:
                    codigo_str = str(int(codigo_el.text.strip()))
                    db.query(models.Estacao).filter(models.Estacao.codigo == codigo_str).update({"estado": uf})
                    count += 1
        db.commit()
        return {"status": "patched", "uf": uf, "count": count}
    except Exception as e:
        import traceback
        return {"error": str(e), "traceback": traceback.format_exc()}
    
@app.get("/api/recalc-anomalias")
def recalc_anomalias(db: Session = Depends(get_db)):
    import pandas as pd
    import numpy as np
    from database import mongo_db
    import models

    collection = mongo_db["raw_estacoes"]
    estacoes_mongo = list(collection.find({}))
    updated = 0

    for est in estacoes_mongo:
        codigo = est.get('codigo')
        cota_atual = est.get('cotaUltimaMedicao')
        data_atual_str = est.get('dataHoraUltimaMedicao')
        
        if not codigo or cota_atual is None or not data_atual_str:
            continue
            
        try:
            mes_atual = int(data_atual_str[5:7])
        except:
            continue
            
        medicoes = db.query(models.MedicaoDiaria).filter(models.MedicaoDiaria.codigo_estacao == str(codigo)).all()
        if not medicoes:
            continue
            
        df = pd.DataFrame([{"data": m.data, "cota": m.cota} for m in medicoes if m.cota is not None])
        if df.empty:
            continue
            
        # Remove zeros (which are usually sensor errors) just like the frontend
        df = df[df['cota'] != 0]
        if df.empty:
            continue
            
        df['mes'] = df['data'].dt.month
        
        # Calculate mean and std directly from daily values (not from monthly averages)
        # using ddof=0 to match the frontend's population standard deviation logic
        climatologia = df.groupby('mes')['cota'].agg(media='mean', std=lambda x: x.std(ddof=0)).reset_index()
        
        clim_mes = climatologia[climatologia['mes'] == mes_atual]
        if clim_mes.empty:
            continue
            
        media = clim_mes.iloc[0]['media']
        std = clim_mes.iloc[0]['std']
        
        if pd.isna(media) or pd.isna(std) or std == 0:
            continue
            
        z_score = (cota_atual - media) / std
        
        if z_score > 2.0: anomalia = 'ANOMALIA_POSITIVA_EXTREMA'
        elif z_score > 1.5: anomalia = 'ANOMALIA_POSITIVA_SEVERA'
        elif z_score > 1.0: anomalia = 'ANOMALIA_POSITIVA_MODERADA'
        elif z_score > 0.5: anomalia = 'ANOMALIA_POSITIVA_LEVE'
        elif z_score > -0.5: anomalia = 'NORMALIDADE'
        elif z_score > -1.0: anomalia = 'ANOMALIA_NEGATIVA_LEVE'
        elif z_score > -1.5: anomalia = 'ANOMALIA_NEGATIVA_MODERADA'
        elif z_score > -2.0: anomalia = 'ANOMALIA_NEGATIVA_SEVERA'
        else: anomalia = 'ANOMALIA_NEGATIVA_EXTREMA'
        
        collection.update_one({'_id': est['_id']}, {'$set': {'anomalia': anomalia, 'zScore': float(z_score)}})
        updated += 1
        
    return {"status": "success", "updated": updated}

@app.get("/api/find-wms")
def find_wms():
    import requests
    import re
    from urllib.parse import urljoin
    base_url = 'https://hidro.sipam.gov.br'
    res = requests.get(base_url + '/map', verify=False)
    html = res.text
    scripts = re.findall(r'<script[^>]+src="([^"]+)"', html)
    urls = []
    for src in scripts:
        url = urljoin(base_url, src)
        try:
            js_res = requests.get(url, verify=False, timeout=5)
            js = js_res.text
            matches = re.findall(r'(https?://[^"\']*(?:wms|geoserver|cptec|inpe|ows|terrabrasilis)[^"\']*)', js, re.IGNORECASE)
            urls.extend(list(set(matches)))
        except:
            pass
    return {"urls": list(set(urls))}

@app.get("/api/debug2")
def get_debug2():
    import requests
    url_3857 = "https://siger.sipam.gov.br/geoserver/sipam/wms?service=WMS&request=GetMap&layers=sipam:cpc_grade&styles=&format=image/png&transparent=true&version=1.1.1&viewparams=dia:05;mes:08;ano:2026&width=256&height=256&srs=EPSG:3857&bbox=-6261721,-2504688,-5009377,-1252344"
    r_3857 = requests.get(url_3857, verify=False)
    url_4326 = "https://siger.sipam.gov.br/geoserver/sipam/wms?service=WMS&request=GetMap&layers=sipam:cpc_grade&styles=&format=image/png&transparent=true&version=1.1.1&viewparams=dia:05;mes:08;ano:2026&width=256&height=256&srs=EPSG:4326&bbox=-90,11.1,-78.75,21.94"
    r_4326 = requests.get(url_4326, verify=False)
    return {"size_3857": len(r_3857.content), "size_4326": len(r_4326.content)}

from fastapi import Request
from fastapi.responses import Response

@app.get("/api/wms")
async def proxy_wms(request: Request):
    url = "https://siger.sipam.gov.br/geoserver/sipam/wms"
    params = dict(request.query_params)
    import requests
    r = requests.get(url, params=params, verify=False)
    return Response(content=r.content, media_type=r.headers.get("Content-Type", "image/png"))

@app.get("/api/debug-ana-chuva")
def get_debug_ana_chuva():
    import requests
    # 1. Auth
    auth_url = "https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/OAUth/v1"
    headers = {
        "Identificador": "01763968294",
        "Senha": "cr53pe56"
    }
    r1 = requests.get(auth_url, headers=headers)
    if not r1.ok:
        return {"error": f"Auth failed {r1.status_code}"}
    
    token = r1.json()["items"]["tokenautenticacao"]

    # 2. Fetch
    data_url = "https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/HidroinfoanaSerieTelemetricaAdotada/v1"
    params = {
        "Código da Estação": "18850000",
        "Tipo Filtro Data": "DATA_LEITURA",
        "Range Intervalo de busca": "DIAS_14"
    }
    h2 = {
        "Authorization": f"Bearer {token}"
    }
    r2 = requests.get(data_url, params=params, headers=h2)
    if not r2.ok:
        return {"error": f"Data failed {r2.status_code}"}
    
    return r2.json()

@app.get("/api/estacoes/{codigo}/historico")
def get_historico(codigo: str, db: Session = Depends(get_db)):
    """
    Returns historical data and calculates P15, P85 and Z-Score using Pandas.
    """
    # Query data from DB
    medicoes = db.query(models.MedicaoDiaria).filter(models.MedicaoDiaria.codigo_estacao == codigo).order_by(models.MedicaoDiaria.data).all()
    
    if not medicoes:
        raise HTTPException(status_code=404, detail="Estação ou histórico não encontrado")
    
    # Process with Pandas
    df = pd.DataFrame([{
        "data": m.data,
        "cota": m.cota,
        "vazao": m.vazao
    } for m in medicoes])
    
    df['mes'] = df['data'].dt.month
    
    # Calculate P15, P85, mean and std climatology per month
    climatologia = df.groupby('mes')['cota'].agg(
        p15=lambda x: np.percentile(x.dropna(), 15) if len(x.dropna()) > 0 else None,
        p85=lambda x: np.percentile(x.dropna(), 85) if len(x.dropna()) > 0 else None,
        media='mean',
        std='std'
    ).reset_index()
    
    # Find absolute minimum
    minimo_historico = float(df['cota'].min()) if not pd.isna(df['cota'].min()) else None
    ano_minimo = int(df.loc[df['cota'].idxmin(), 'data'].year) if minimo_historico is not None else None
    
    ano_inicio = int(df['data'].min().year) if not df.empty else None
    ano_fim = int(df['data'].max().year) if not df.empty else None
    
    # Replace NaN with None for JSON serialization
    climatologia = climatologia.replace({np.nan: None})
    
    return {
        "codigo": codigo,
        "estatisticas": {
            "minimo_absoluto": minimo_historico,
            "ano_minimo": ano_minimo,
            "ano_inicio": ano_inicio,
            "ano_fim": ano_fim
        },
        "climatologia": climatologia.to_dict(orient="records"),
        "historico_recente": df.tail(365).to_dict(orient="records") if not df.empty else []
    }

@app.get("/api/estacoes/{codigo}/chuva")
def get_chuva(codigo: str, db: Session = Depends(get_db)):
    """
    Returns historical rainfall data and calculates P15, P85 and Z-Score using Pandas.
    """
    medicoes = db.query(models.PrecipitacaoDiaria).filter(models.PrecipitacaoDiaria.codigo_estacao == codigo).order_by(models.PrecipitacaoDiaria.data).all()
    
    if not medicoes:
        raise HTTPException(status_code=404, detail="Estação ou histórico de chuva não encontrado")
    
    df = pd.DataFrame([{
        "data": m.data,
        "chuva": m.chuva
    } for m in medicoes])
    
    df['ano'] = df['data'].dt.year
    df['mes'] = df['data'].dt.month
    
    # Chuva climatology must be based on MONTHLY SUMS, not daily averages!
    # First, aggregate daily rainfall into monthly sums per year
    df_mensal = df.groupby(['ano', 'mes'])['chuva'].sum().reset_index()
    
    # Calculate P15, P85, mean and std of the MONTHLY SUMS
    climatologia = df_mensal.groupby('mes')['chuva'].agg(
        p15=lambda x: np.percentile(x.dropna(), 15) if len(x.dropna()) > 0 else None,
        p85=lambda x: np.percentile(x.dropna(), 85) if len(x.dropna()) > 0 else None,
        media='mean',
        std='std'
    ).reset_index()
    
    minimo_historico = float(df_mensal['chuva'].min()) if not pd.isna(df_mensal['chuva'].min()) else None
    ano_minimo = int(df_mensal.loc[df_mensal['chuva'].idxmin(), 'ano']) if minimo_historico is not None else None
    
    ano_inicio = int(df['data'].min().year) if not df.empty else None
    ano_fim = int(df['data'].max().year) if not df.empty else None
    
    # Replace NaN with None for JSON serialization
    climatologia = climatologia.replace({np.nan: None})
    
    return {
        "codigo": codigo,
        "estatisticas": {
            "minimo_absoluto": minimo_historico,
            "ano_minimo": ano_minimo,
            "ano_inicio": ano_inicio,
            "ano_fim": ano_fim
        },
        "climatologia": climatologia.to_dict(orient="records"),
        "historico_recente": df.tail(365).to_dict(orient="records") if not df.empty else []
    }

@app.get("/api/estacoes/{codigo}/elnino")
def get_elnino_data(codigo: str, data_inicio: str, data_fim: str):
    import requests
    import xml.etree.ElementTree as ET
    
    # ANA format requires DD/MM/YYYY
    url = f"http://telemetriaws1.ana.gov.br/ServiceANA.asmx/HidroSerieHistorica?codEstacao={codigo}&dataInicio={data_inicio}&dataFim={data_fim}&tipoDados=1&nivelConsistencia="
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        r = requests.get(url, headers=headers, timeout=60)
        root = ET.fromstring(r.text)
        
        dados = []
        for serie in root.iter():
            if 'SerieHistorica' in serie.tag:
                data_str = None
                for child in serie:
                    if 'DataHora' in child.tag:
                        data_str = child.text
                        break
                
                if not data_str: continue
                ano = int(data_str[0:4])
                mes = int(data_str[5:7])
                
                for d in range(1, 32):
                    cota_tag = f'Cota{d:02d}'
                    cota_val = None
                    for child in serie:
                        if cota_tag in child.tag:
                            cota_val = child.text
                            break
                    if cota_val:
                        try:
                            cota = float(cota_val)
                            data_medicao = f"{ano}-{mes:02d}-{d:02d}"
                            dados.append({"data": data_medicao, "cota": cota})
                        except ValueError:
                            pass
                            
        return {"codigo": codigo, "dados": dados}
    except Exception as e:
        import traceback
        return {"error": str(e), "traceback": traceback.format_exc()}

@app.get("/api/bacias")
def get_bacias():
    import requests
    try:
        # Busca Bacias (Sub-bacias) do Sipam
        url = "https://siger.sipam.gov.br/geoserver/sipam/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=sipam%3Aestiagem_subbacia_icoe&maxFeatures=5000&outputFormat=application%2Fjson"
        r = requests.get(url, timeout=15, verify=False)
        return r.json()
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/subbacia/{id}/chuva")
def get_subbacia_chuva(id: str, lat: float, lng: float, date: str = None, estimador: str = "NOAA"):
    import requests
    import datetime
    import pandas as pd
    try:
        # Pega a data ou usa hoje
        if not date:
            date = datetime.datetime.now().strftime("%Y-%m-%d")
        
        ano, mes, dia = date.split('-')
        
        # Mapeia estimador para a API do Sipam
        est_api = "CPC" if estimador == "NOAA" else estimador
        
        # 1. Tenta buscar os dados exatos do Sipam
        sipam_data = {}
        try:
            url_sipam = f"https://apihidro.sipam.gov.br/grandebaciachuvas/acumulado/{ano}/{mes}/{dia}/long/{lng}/lat/{lat}/{est_api}"
            r_sipam = requests.get(url_sipam, verify=False, timeout=5)
            if r_sipam.status_code == 200:
                sipam_data = r_sipam.json()
        except Exception as e:
            print("Erro ao buscar no Sipam:", e)
            
        # 2. Busca serie historica do open-meteo para o grafico (já que o Sipam não retorna a série no popup)
        url_om = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}&daily=precipitation_sum&timezone=America%2FSao_Paulo&past_days=30&forecast_days=15"
        r_om = requests.get(url_om, timeout=10)
        data_om = r_om.json()
        
        serie = []
        if "daily" in data_om:
            df = pd.DataFrame({
                "data": data_om["daily"]["time"],
                "chuva": data_om["daily"]["precipitation_sum"]
            })
            for _, row in df.iterrows():
                if pd.isna(row["chuva"]): continue
                serie.append({
                    "data": pd.to_datetime(row["data"]).strftime("%Y-%m-%d"),
                    "chuva": float(row["chuva"])
                })
        
        return {
            "id": id,
            "acumulado_7": sipam_data.get("precipitacaoAcumuladoSete", 0.0),
            "acumulado_15": sipam_data.get("precipitacaoAcumuladoQuinze", 0.0),
            "acumulado_30": sipam_data.get("precipitacaoAcumuladoTrinta", 0.0),
            "precipitacaoCpc": sipam_data.get("precipitacaoCpc", 0.0),
            "serie": serie
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/debug-sipam")
def get_debug_sipam():
    import requests
    import re
    from urllib.parse import urljoin
    try:
        base_url = 'https://hidro.sipam.gov.br'
        res = requests.get(base_url, verify=False)
        html = res.text
        
        # Encontrar todos os scripts js
        scripts = re.findall(r'<script[^>]+src="([^"]+)"', html)
        scripts += re.findall(r'href="([^"]+\.js)"', html)
        
        urls_found = []
        endpoints = []
        for src in scripts:
            url = urljoin(base_url, src)
            urls_found.append(url)
            try:
                js_res = requests.get(url, verify=False, timeout=5)
                js = js_res.text
                
                # Procura por strings que parecem endpoints de API
                matches = re.findall(r'["\'](https://[^"\']*sipam[^"\']*/api/[^"\']*)["\']', js)
                matches += re.findall(r'["\'](/api/[^"\']*)["\']', js)
                matches += re.findall(r'["\'](/chuva[^"\']*)["\']', js)
                matches += re.findall(r'["\'](/bacia[^"\']*)["\']', js)
                
                endpoints.extend(matches)
            except Exception as e:
                endpoints.append(f"Erro no script {url}: {e}")
                
        return {"scripts": urls_found, "endpoints": list(set(endpoints))}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/test-sipam-bacia")
def test_sipam_bacia():
    import requests
    url = "https://apihidro.sipam.gov.br/grandebaciachuvas/acumulado/2026/08/05/long/-47.07352050389422/lat/-1.9763145446261958/CPC"
    try:
        r = requests.get(url, verify=False)
        return r.json()
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/test-wfs")
def test_wfs():
    import requests
    url = "https://siger.sipam.gov.br/geoserver/sipam/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=sipam%3Aestiagem_subbacia_icoe&maxFeatures=1&outputFormat=application%2Fjson"
    try:
        r = requests.get(url, verify=False, timeout=15)
        import json
        data = r.json()
        return {"properties": data["features"][0]["properties"]}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/search-station/{query}")
def search_station(query: str, db: Session = Depends(get_db)):
    from database import mongo_db
    import re
    regex = re.compile(f".*{query}.*", re.IGNORECASE)
    estacoes = list(mongo_db["raw_estacoes"].find({"nome": regex}, {"_id": 0}))
    return [{"nome": e.get("nome"), "codigo": e.get("codigo"), "cotaUltimaMedicao": e.get("cotaUltimaMedicao")} for e in estacoes]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
