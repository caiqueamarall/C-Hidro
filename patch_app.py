import os

file_path = r'd:\Caique Amaral\Documents\Projetos\Nivel dos Rios\SipamClone\src\App.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add state
old_state = "const [progStationId, setProgStationId] = useState<number | ''>('');\n  const [progData, setProgData] = useState<any[]>([]);"
new_state = "const [progStationId, setProgStationId] = useState<number | ''>('');\n  const [progDataType, setProgDataType] = useState<'cota' | 'chuva'>('cota');\n  const [progData, setProgData] = useState<any[]>([]);"
content = content.replace(old_state, new_state)

# 2. Add endpoint logic
old_fetch = "const response = await fetch(`http://localhost:8000/api/estacoes/${progStationId}/historico`).then(res => {"
new_fetch = "const endpoint = progDataType === 'cota' ? 'historico' : 'chuva';\n      const response = await fetch(`http://localhost:8000/api/estacoes/${progStationId}/${endpoint}`).then(res => {"
content = content.replace(old_fetch, new_fetch)

# 3. Add telemetry logic
old_telemetry = """         telemetryData.forEach((t: any) => {
            const dateStr = t.Data_Hora_Medicao;
            const cotaStr = t.Cota_Sensor || t.Cota_Adotada || '0';
            const cota = parseFloat(cotaStr);
            if (!dateStr || isNaN(cota) || cota === 0) return;
            const yyyy = dateStr.substring(0,4);
            const mm = dateStr.substring(5,7);
            const key = `${yyyy}-${mm}`;
            const curr = telemetryMap.get(key) || {sum: 0, count: 0};
            telemetryMap.set(key, {sum: curr.sum + cota, count: curr.count + 1});
         });
         telemetryMap.forEach((val, key) => {
            telemetryMonthlyMeans.set(key, val.sum / val.count);
         });"""

new_telemetry = """         telemetryData.forEach((t: any) => {
            const dateStr = t.Data_Hora_Medicao;
            const valStr = progDataType === 'cota' ? (t.Cota_Sensor || t.Cota_Adotada || '0') : (t.Chuva_Acumulada || '0');
            const val = parseFloat(valStr);
            if (!dateStr || isNaN(val) || (progDataType === 'cota' && val === 0)) return;
            const yyyy = dateStr.substring(0,4);
            const mm = dateStr.substring(5,7);
            const key = `${yyyy}-${mm}`;
            const curr = telemetryMap.get(key) || {sum: 0, count: 0};
            telemetryMap.set(key, {sum: curr.sum + val, count: curr.count + 1});
         });
         telemetryMap.forEach((val, key) => {
            // For rainfall we SUM the daily values to get the monthly accumulated. For levels, we AVERAGE them.
            telemetryMonthlyMeans.set(key, progDataType === 'cota' ? val.sum / val.count : val.sum);
         });"""
content = content.replace(old_telemetry, new_telemetry)

# 4. Fallback logic
old_fallback = """      // Procura o dado mais recente do ano corrente para extrair o Z-Score atual
      let currentMonthOffset = 2; // offset 2 = mês atual
      const estacaoCorrente = estacoes.find(e => String(e.codigo) === String(progStationId));
      let cotaRealTime = estacaoCorrente?.cotaDataAtual?.media || estacaoCorrente?.cotaRegua?.media || estacaoCorrente?.cotaUltimaMedicao || null;
      
      if (cotaRealTime) {
          const baseClim = clim[now.getMonth()];
          if (baseClim) {
              zAtual = (cotaRealTime - baseClim.media) / baseClim.std;
          }
          setProgCotaAtual(cotaRealTime);
      }"""

new_fallback = """      // Procura o dado mais recente do ano corrente para extrair o Z-Score atual
      let currentMonthOffset = 2; // offset 2 = mês atual
      
      // Calculate current value directly from telemetry instead of SIPAM fallback if available
      const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      let actualValue = telemetryMonthlyMeans.get(nowKey) || null;
      
      if (!actualValue && progDataType === 'cota') {
         const estacaoCorrente = estacoes.find(e => String(e.codigo) === String(progStationId));
         actualValue = estacaoCorrente?.cotaDataAtual?.media || estacaoCorrente?.cotaRegua?.media || estacaoCorrente?.cotaUltimaMedicao || null;
      }
      
      if (actualValue) {
          const baseClim = clim[now.getMonth()];
          if (baseClim) {
              zAtual = (actualValue - baseClim.media) / baseClim.std;
          }
          setProgCotaAtual(actualValue);
      }"""
content = content.replace(old_fallback, new_fallback)

# 5. History aggregation
old_hist = """            if (dataMes.length > 0) {
               const sum = dataMes.reduce((acc: number, val: any) => acc + val.cota, 0);
               obsValue = sum / dataMes.length;
            }
        }
        
        // 3. Fallback extremo pro Sipam se falhar TUDO no mês corrente
        if (obsValue === null && offset === 2 && cotaRealTime) {"""
        
new_hist = """            if (dataMes.length > 0) {
               const valKey = progDataType === 'cota' ? 'cota' : 'chuva';
               const sum = dataMes.reduce((acc: number, val: any) => acc + (val[valKey] || 0), 0);
               obsValue = progDataType === 'cota' ? sum / dataMes.length : sum;
            }
        }
        
        // 3. Fallback extremo pro Sipam se falhar TUDO no mês corrente
        let cotaRealTime = null;
        if (progDataType === 'cota') {
            const estacaoCorrente = estacoes.find(e => String(e.codigo) === String(progStationId));
            cotaRealTime = estacaoCorrente?.cotaDataAtual?.media || estacaoCorrente?.cotaRegua?.media || estacaoCorrente?.cotaUltimaMedicao || null;
        }
        
        if (obsValue === null && offset === 2 && cotaRealTime) {"""
content = content.replace(old_hist, new_hist)


# 6. UI Toggle
old_ui_toggle = """          <div className="flex-1 overflow-y-auto p-4 flex flex-col">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 px-2">Prognóstico Hidrológico</h2>
            
            <label className="text-sm font-semibold text-slate-600 mb-1 px-2">Selecione a Estação</label>
            <select 
              className="w-full bg-white border border-slate-300 rounded-lg p-3 text-sm mb-4 outline-none focus:border-blue-500 shadow-sm"
              value={progStationId}"""
              
new_ui_toggle = """          <div className="flex-1 overflow-y-auto p-4 flex flex-col">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 px-2">Prognóstico Hidrológico</h2>
            
            <div className="flex gap-2 mb-4 px-2">
              <button 
                onClick={() => setProgDataType('cota')}
                className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors border ${progDataType === 'cota' ? 'bg-blue-100 text-blue-700 border-blue-300 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              >
                Nível (Cota)
              </button>
              <button 
                onClick={() => setProgDataType('chuva')}
                className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors border ${progDataType === 'chuva' ? 'bg-blue-100 text-blue-700 border-blue-300 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              >
                Chuva (Precip.)
              </button>
            </div>
            
            <label className="text-sm font-semibold text-slate-600 mb-1 px-2">Selecione a Estação</label>
            <select 
              className="w-full bg-white border border-slate-300 rounded-lg p-3 text-sm mb-4 outline-none focus:border-blue-500 shadow-sm"
              value={progStationId}"""
content = content.replace(old_ui_toggle, new_ui_toggle)


# 7. Chart UI
old_chart = """          <div className="flex-1 bg-white p-6 relative flex flex-col overflow-y-auto">
            <h1 className="text-2xl font-bold text-slate-800 mb-2">
              Previsão hidrológica para os próximos meses na estação: {estacoes.find(e => String(e.codigo) === String(progStationId))?.nome} ({progStationId})
            </h1>
            <p className="text-sm text-slate-500 mb-6">
              As anomalias representam os Desvios Padrão (SPI/SSI) da média histórica ({progDataInicial} a {progDataFinal}) processados em tempo real pela API da ANA.
            </p>
            
            {progCotaAtual && (
              <div className="mb-8 p-3 bg-red-50 border border-red-100 rounded-lg">
                <span className="text-red-700 font-bold">Cota atual: </span> 
                <span className="text-red-600 font-semibold">{progCotaAtual.toFixed(0)} cm 
                {progMinHistValue !== null ? ` (${Math.max(0, progCotaAtual - progMinHistValue).toFixed(0)} cm acima do mínimo histórico de ${progMinHistValue.toFixed(0)} cm registrado em ${progMinHistYear})` : ''}</span>
              </div>
            )}
            
            <div className="h-[600px] w-full min-h-[600px] flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={progData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="mes" tick={{fontSize: 12, fill: '#64748b'}} tickMargin={10} axisLine={false} tickLine={false} />
                  <YAxis 
                    label={{ value: 'Cota (cm)', angle: -90, position: 'insideLeft', style: {textAnchor: 'middle', fill: '#475569', fontWeight: 'bold'} }}"""
                    
new_chart = """          <div className="flex-1 bg-white p-6 relative flex flex-col overflow-y-auto">
            <h1 className="text-2xl font-bold text-slate-800 mb-2">
              Previsão {progDataType === 'cota' ? 'hidrológica' : 'pluviométrica'} para os próximos meses na estação: {estacoes.find(e => String(e.codigo) === String(progStationId))?.nome} ({progStationId})
            </h1>
            <p className="text-sm text-slate-500 mb-6">
              As anomalias representam os Desvios Padrão (SPI/SSI) da média histórica ({progDataInicial} a {progDataFinal}) processados em tempo real pela API da ANA.
            </p>
            
            {progCotaAtual !== null && (
              <div className="mb-8 p-3 bg-red-50 border border-red-100 rounded-lg">
                <span className="text-red-700 font-bold">{progDataType === 'cota' ? 'Cota' : 'Precipitação'} atual: </span> 
                <span className="text-red-600 font-semibold">{progCotaAtual.toFixed(0)} {progDataType === 'cota' ? 'cm' : 'mm'} 
                {progMinHistValue !== null && progDataType === 'cota' ? ` (${Math.max(0, progCotaAtual - progMinHistValue).toFixed(0)} ${progDataType === 'cota' ? 'cm' : 'mm'} acima do mínimo histórico de ${progMinHistValue.toFixed(0)} ${progDataType === 'cota' ? 'cm' : 'mm'} registrado em ${progMinHistYear})` : ''}</span>
              </div>
            )}
            
            <div className="h-[600px] w-full min-h-[600px] flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={progData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="mes" tick={{fontSize: 12, fill: '#64748b'}} tickMargin={10} axisLine={false} tickLine={false} />
                  <YAxis 
                    label={{ value: progDataType === 'cota' ? 'Cota (cm)' : 'Precipitação (mm)', angle: -90, position: 'insideLeft', style: {textAnchor: 'middle', fill: '#475569', fontWeight: 'bold'} }}"""
content = content.replace(old_chart, new_chart)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch applied to App.tsx")
