import sys
import pandas as pd
from database import SessionLocal, mongo_db
import models

def run():
    db = SessionLocal()
    collection = mongo_db["raw_estacoes"]
    estacoes_mongo = list(collection.find({}))
    updated = 0
    
    print(f"Total stations to process: {len(estacoes_mongo)}")
    
    for idx, est in enumerate(estacoes_mongo):
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
        df = df[df['cota'] != 0]
        if df.empty:
            continue
            
        df['mes'] = df['data'].dt.month
        
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
        
        if (idx + 1) % 10 == 0:
            print(f"Processed {idx + 1}/{len(estacoes_mongo)}")
            
    print(f"Done! Updated {updated} stations.")

if __name__ == "__main__":
    run()
