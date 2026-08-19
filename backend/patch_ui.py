import os

file_path = r'd:\Caique Amaral\Documents\Projetos\Nivel dos Rios\SipamClone\src\App.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Title and Current Value
old_title = """            <h2 className="text-2xl font-bold text-slate-800 mb-2">Previsão hidrológica para os próximos meses na estação: {estacoes.find(e => e.codigo == progStationId)?.nome} ({progStationId})</h2>
            <p className="text-sm text-slate-500 mb-2 max-w-4xl">As anomalias representam os Desvios Padrão (SPI/SSI) da média histórica ({progDataInicial} a {progDataFinal}) processados em tempo real pela API da ANA.</p>
            {progCotaAtual !== null && progMinHistValue !== null && (
              <div className="mb-6 inline-block bg-red-50 border border-red-200 text-red-800 px-4 py-2 rounded-lg text-sm font-semibold">
                Cota atual: {progCotaAtual.toFixed(0)} cm ({Math.round(progCotaAtual - progMinHistValue)} cm acima do mínimo histórico de {progMinHistValue.toFixed(0)} cm registrado em {progMinHistYear})
              </div>
            )}"""

new_title = """            <h2 className="text-2xl font-bold text-slate-800 mb-2">Previsão {progDataType === 'cota' ? 'hidrológica' : 'pluviométrica'} para os próximos meses na estação: {estacoes.find(e => String(e.codigo) === String(progStationId))?.nome} ({progStationId})</h2>
            <p className="text-sm text-slate-500 mb-2 max-w-4xl">As anomalias representam os Desvios Padrão (SPI/SSI) da média histórica ({progDataInicial} a {progDataFinal}) processados em tempo real pela API da ANA.</p>
            {progCotaAtual !== null && progMinHistValue !== null && progDataType === 'cota' && (
              <div className="mb-6 inline-block bg-red-50 border border-red-200 text-red-800 px-4 py-2 rounded-lg text-sm font-semibold">
                Cota atual: {progCotaAtual.toFixed(0)} cm ({Math.round(progCotaAtual - progMinHistValue)} cm acima do mínimo histórico de {progMinHistValue.toFixed(0)} cm registrado em {progMinHistYear})
              </div>
            )}
            {progCotaAtual !== null && progDataType === 'chuva' && (
              <div className="mb-6 inline-block bg-blue-50 border border-blue-200 text-blue-800 px-4 py-2 rounded-lg text-sm font-semibold">
                Precipitação atual: {progCotaAtual.toFixed(1)} mm
              </div>
            )}"""
content = content.replace(old_title, new_title)

# 2. Update Y-Axis
old_yaxis = """                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 13, fill: '#64748b' }} axisLine={false} tickLine={false} label={{ value: 'Cota (cm)', angle: -90, position: 'insideLeft', offset: -10, fill: '#64748b', fontWeight: 'bold' }} />"""

new_yaxis = """                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 13, fill: '#64748b' }} axisLine={false} tickLine={false} label={{ value: progDataType === 'cota' ? 'Cota (cm)' : 'Precipitação (mm)', angle: -90, position: 'insideLeft', offset: -10, fill: '#64748b', fontWeight: 'bold' }} />"""
content = content.replace(old_yaxis, new_yaxis)

# 3. Update Legend/Tooltip
old_legend = """                    <Line type="monotone" dataKey="observado" name="Nível Observado (Real)" stroke="#ff0000" strokeWidth={3} dot={{r: 5, fill: '#ff0000'}} />"""

new_legend = """                    <Line type="monotone" dataKey="observado" name={progDataType === 'cota' ? "Nível Observado (Real)" : "Precipitação Observada (Real)"} stroke="#ff0000" strokeWidth={3} dot={{r: 5, fill: '#ff0000'}} />"""
content = content.replace(old_legend, new_legend)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("UI Text Patch applied to App.tsx")
