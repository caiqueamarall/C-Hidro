import requests
import xml.etree.ElementTree as ET
import datetime
from sqlalchemy.orm import Session
from database import SessionLocal
import models
import time

def parse_ana_date(date_str):
    # ANA usually returns dates like '2010-01-01T00:00:00'
    return datetime.datetime.strptime(date_str[:10], '%Y-%m-%d')

def ingest_real_history():
    print("Iniciando ingestão de dados REAIS da ANA...")
    db: Session = SessionLocal()
    
    # Pegar todas as estações cadastradas
    estacoes = db.query(models.Estacao).all()
    if not estacoes:
        print("Nenhuma estação encontrada no banco de dados!")
        return
        
    print("Limpando a tabela MedicaoDiaria (removendo dados falsos da POC)...")
    db.query(models.MedicaoDiaria).delete()
    db.commit()
    print("Tabela limpa.")
    
    print(f"Buscando histórico real de {len(estacoes)} estações (de 01/01/2010 até hoje)...")
    
    # WS da ANA para séries históricas
    url = 'http://telemetriaws1.ana.gov.br/ServiceANA.asmx/HidroSerieHistorica'
    
    for i, est in enumerate(estacoes):
        print(f"[{i+1}/{len(estacoes)}] Baixando estação {est.codigo} - {est.nome}...")
        
        params = {
            'codEstacao': est.codigo,
            'dataInicio': '01/01/2010',
            'dataFim': '',
            'tipoDados': '1', # 1 = Cotas
            'nivelConsistencia': '' # Traz tanto dados brutos quanto consistidos
        }
        
        try:
            r = requests.get(url, params=params, timeout=60)
            if r.status_code != 200:
                print(f"Erro na API da ANA (status {r.status_code}) para estação {est.codigo}. Pulando.")
                continue
                
            # Fazer o parsing do XML ignorando namespaces complicados
            root = ET.fromstring(r.text)
            
            medicoes_para_inserir = []
            
            # O XML retorna tags <SerieHistorica>
            # Em ElementTree com namespace, podemos buscar ignorando o prefixo
            for serie in root.iter():
                # Tentar achar a tag que termina com SerieHistorica
                if 'SerieHistorica' in serie.tag:
                    data_hora_el = None
                    # Varrer os filhos ignorando namespace
                    for child in serie:
                        if 'DataHora' in child.tag:
                            data_hora_el = child
                            break
                                
                    if data_hora_el is None or not data_hora_el.text:
                        continue
                        
                    mes_base = parse_ana_date(data_hora_el.text)
                    
                    # Varre os 31 dias
                    for dia in range(1, 32):
                        tag_cota = f'Cota{dia:02d}'
                        
                        cota_el = None
                        for child in serie:
                            if tag_cota in child.tag:
                                cota_el = child
                                break
                                
                        if cota_el is not None and cota_el.text:
                            try:
                                valor_cota = float(cota_el.text)
                                # A ANA guarda a data base como dia 1 do mes
                                data_medicao = mes_base + datetime.timedelta(days=dia-1)
                                
                                # Apenas insere se o mês gerado for o mesmo do mês base (evita fev com 30 dias vazando pro outro mes)
                                if data_medicao.month == mes_base.month:
                                    medicoes_para_inserir.append(
                                        models.MedicaoDiaria(
                                            codigo_estacao=est.codigo,
                                            data=data_medicao,
                                            cota=valor_cota,
                                            vazao=None # Para cotas, vazao não vem aqui
                                        )
                                    )
                            except ValueError:
                                pass
                                
            if medicoes_para_inserir:
                db.bulk_save_objects(medicoes_para_inserir)
                db.commit()
                print(f"✅ Inseridos {len(medicoes_para_inserir)} registros REAIS para a estação {est.codigo}.")
            else:
                print(f"⚠️ Nenhum dado de cota encontrado para a estação {est.codigo} desde 2010.")
                
            # Pequena pausa para nao derrubar a API da ANA
            time.sleep(1)
            
        except Exception as e:
            print(f"Erro ao processar estação {est.codigo}: {e}")
            db.rollback()
            
    db.close()
    print("Ingestão de dados REAIS concluída com sucesso!")

if __name__ == "__main__":
    ingest_real_history()
