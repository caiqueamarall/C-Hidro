export const IDENTIFICADOR = '01763968294';
export const SENHA = 'cr53pe56';

let currentToken: string | null = null;
let tokenExpiration: Date | null = null;

export async function authenticateAna(forceRefresh = false) {
  // Check if token exists and is valid (valid for 60 min, refresh if less than 5 min left)
  if (!forceRefresh && currentToken && tokenExpiration) {
    const now = new Date();
    const minTimeLeft = new Date(now.getTime() + 5 * 60000);
    if (tokenExpiration > minTimeLeft) {
      return currentToken;
    }
  }

  try {
    const response = await fetch('https://corsproxy.io/?url=' + encodeURIComponent('https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/OAUth/v1'), {
      method: 'GET',
      headers: {
        'Identificador': IDENTIFICADOR,
        'Senha': SENHA
      }
    });

    if (!response.ok) {
      console.error('Falha na autenticação da ANA:', response.status);
      return null;
    }

    const data = await response.json();
    if (data && data.items && data.items.tokenautenticacao) {
      currentToken = data.items.tokenautenticacao;
      
      // Token is valid for 60 minutes. Set expiration to 55 minutes to be safe.
      const exp = new Date();
      exp.setMinutes(exp.getMinutes() + 55);
      tokenExpiration = exp;
      
      return currentToken;
    }
    return null;
  } catch (error) {
    console.error('Erro ao conectar com API ANA:', error);
    return null;
  }
}

export async function fetchHistoricoEstacao(codigoEstacao: number, rangeDias: 'DIAS_14' | 'DIAS_30' | 'DIAS_90' | 'DIAS_180' = 'DIAS_14', dataBusca?: string) {
  // 1. Tentar ler do arquivo estático gerado pelo GitHub Actions (últimos 180 dias)
  try {
    const basePath = window.location.pathname.includes('/SipamClone') ? '/SipamClone' : '';
    const res = await fetch(`${basePath}/historico/${codigoEstacao}.json`);
    
    if (res.ok) {
      const items = await res.json();
      if (items && items.length > 0) {
        if (!dataBusca) {
          return items;
        } else {
          // Se pediu uma dataBusca específica, filtra o arquivo estático
          const targetDate = new Date(dataBusca + 'T00:00:00');
          const rangeDaysMap = { 'DIAS_14': 14, 'DIAS_30': 30, 'DIAS_90': 90, 'DIAS_180': 180 };
          const maxDays = rangeDaysMap[rangeDias] || 14;
          
          const targetEnd = new Date(targetDate);
          targetEnd.setDate(targetEnd.getDate() + maxDays);
          
          const filtered = items.filter((item: any) => {
            if (!item.Data_Hora_Medicao) return false;
            let dStr = item.Data_Hora_Medicao;
            if (dStr.endsWith('Z')) dStr = dStr.slice(0, -1);
            const itemDate = new Date(dStr);
            return itemDate >= targetDate && itemDate <= targetEnd;
          });
          
          // Se encontrou dados suficientes para essa busca no estático, retorna!
          // Se for uma busca antiga (ex: 2020), o filtered virá vazio e cairá no fallback
          if (filtered.length > 0) {
            return filtered;
          }
        }
      }
    }
  } catch (err) {
    console.warn("Estático indisponível, caindo para proxies...", err);
  }

  // 2. Fallback: Buscar da API oficial da ANA usando Proxies
  const token = await authenticateAna();
  if (!token) return [];

  try {
    const params = new URLSearchParams({
      'Código da Estação': codigoEstacao.toString(),
      'Tipo Filtro Data': 'DATA_LEITURA',
      'Range Intervalo de busca': rangeDias
    });

    if (dataBusca) {
      params.append('Data de Busca (yyyy-MM-dd)', dataBusca);
    }

    const urlDestino = 'https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/HidroinfoanaSerieTelemetricaAdotada/v1?' + params.toString();
    const proxyList = [
      'https://corsproxy.io/?url=',
      'https://api.cors.lol/?url=',
      'https://thingproxy.freeboard.io/fetch/'
    ];

    let response = null;
    for (const proxy of proxyList) {
      try {
        response = await fetch(proxy + encodeURIComponent(urlDestino), {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (response.ok) break; // Sucesso, sai do loop
      } catch (e) {
        console.warn(`Proxy ${proxy} falhou, tentando o próximo...`);
      }
    }

    if (!response || !response.ok) {
      console.error('Erro ao buscar histórico da ANA após tentar todos os proxies:', response?.status);
      return [];
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Erro na requisição de histórico:', error);
    return [];
  }
}

export async function downloadSerieHistorica(codigoEstacao: number, dataInicialStr: string, dataFinalStr: string, onProgress?: (percent: number) => void) {
  const startDate = new Date(dataInicialStr + 'T00:00:00');
  const endDate = new Date(dataFinalStr + 'T23:59:59');
  
  let currentEnd = new Date(endDate);
  const allItems: any[] = [];
  
  // Calculate total days for progress bar
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24));
  let daysFetched = 0;
  
  const datesToFetch: string[] = [];
  while (currentEnd >= startDate) {
    datesToFetch.push(currentEnd.toISOString().split('T')[0]);
    currentEnd.setDate(currentEnd.getDate() - 30);
  }
  
  // Batch requests to speed up (reduce size to prevent rate limiting/freezing)
  const batchSize = 3;
  for (let i = 0; i < datesToFetch.length; i += batchSize) {
    const chunk = datesToFetch.slice(i, i + batchSize);
    
    // Update progress slightly before batch to show it's working
    if (onProgress) {
      onProgress(Math.min(Math.round((daysFetched / totalDays) * 100), 100));
    }
    
    const promises = chunk.map(dateBusca => fetchHistoricoEstacao(codigoEstacao, 'DIAS_30', dateBusca));
    
    const results = await Promise.all(promises);
    for (const items of results) {
      if (items && items.length > 0) {
        allItems.push(...items);
      }
    }
    
    daysFetched += chunk.length * 30;
    if (onProgress) {
      onProgress(Math.min(Math.round((daysFetched / totalDays) * 100), 100));
    }
  }
  
  let isFallback = false;
  if (allItems.length === 0) {
    const latestItems = await fetchHistoricoEstacao(codigoEstacao, 'DIAS_30');
    if (latestItems && latestItems.length > 0) {
      allItems.push(...latestItems);
      isFallback = true;
    }
  }
  
  const uniqueItems = new Map<string, any>();
  for (const item of allItems) {
    if (!item.Data_Hora_Medicao) continue;
    
    const timeStr = item.Data_Hora_Medicao.replace(' ', 'T');
    const itemDate = new Date(timeStr);
    
    if (isFallback || (itemDate >= startDate && itemDate <= endDate)) {
      uniqueItems.set(item.Data_Hora_Medicao, item);
    }
  }
  
  const finalArray = Array.from(uniqueItems.values()).sort((a, b) => {
    return new Date(a.Data_Hora_Medicao.replace(' ', 'T')).getTime() - new Date(b.Data_Hora_Medicao.replace(' ', 'T')).getTime();
  });
  
  if (onProgress) onProgress(100);
  
  return { data: finalArray, isFallback };
}

export async function gerarClimatologiaDaEstacao(codigoEstacao: number, onProgress?: (percent: number) => void) {
  const currentYear = new Date().getFullYear();
  const endYear = currentYear - 1;
  const startYear = 2010; // Marco histórico base solicitado
  
  const dataInicialStr = `${startYear}-01-01`;
  const dataFinalStr = `${endYear}-12-31`;
  
  const { data } = await downloadSerieHistorica(codigoEstacao, dataInicialStr, dataFinalStr, onProgress);
  
  const monthlyValues = new Map<string, number[]>();
  for (let i = 1; i <= 12; i++) {
    monthlyValues.set(i.toString().padStart(2, '0'), []);
  }
  
  let oldestDate: Date | null = null;
  let newestDate: Date | null = null;
  let globalMin = Infinity;
  let globalMinDate: Date | null = null;
  
  for (const item of data) {
    const timeStr = item.DataHora || item.Data || item.Data_Hora_Medicao;
    if (!timeStr) continue;
    
    const cotaStr = item.Cota_Sensor || item.Cota_Adotada || item.Nivel_Sensor || item.Nivel_Adotado || item.NivelSensor || item.NivelAdotado || item.Cota || item.Nivel || '';
    const cota = parseFloat(cotaStr);
    
    // Desconsidera valores exatamente iguais a 0 (erro/ausência na ANA)
    if (!isNaN(cota) && cota !== 0) {
      const month = timeStr.substring(5, 7);
      const arr = monthlyValues.get(month);
      if (arr) arr.push(cota);
      
      const itemDate = new Date(timeStr);
      if (!oldestDate || itemDate < oldestDate) oldestDate = itemDate;
      if (!newestDate || itemDate > newestDate) newestDate = itemDate;
      if (cota < globalMin) {
        globalMin = cota;
        globalMinDate = itemDate;
      }
    }
  }
  
  const climatologia = [];
  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  
  for (let m = 1; m <= 12; m++) {
    const monthStr = m.toString().padStart(2, '0');
    const values = monthlyValues.get(monthStr) || [];
    
    let mean = 0;
    let std = 0;
    let p15 = 0;
    let p85 = 0;
    
    if (values.length > 0) {
      // Ordena para extrair percentis
      const sorted = [...values].sort((a, b) => a - b);
      const getP = (p: number) => {
        const idx = (p / 100) * (sorted.length - 1);
        const lower = Math.floor(idx);
        const upper = Math.ceil(idx);
        const weight = idx - lower;
        return sorted[lower] * (1 - weight) + sorted[upper] * weight;
      };
      p15 = getP(15);
      p85 = getP(85);

      mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
      std = Math.sqrt(variance) || 1;
    } else {
      mean = 500;
      std = 50;
      p15 = 450;
      p85 = 550;
    }
    
    climatologia.push({ mes: m, mean, std, p15, p85 });
  }
  
  // Apply a 3-month moving average to smooth the curves (like the SIPAM chart)
  const smoothedClim = climatologia.map((c, i, arr) => {
    const prev = arr[(i - 1 + 12) % 12];
    const next = arr[(i + 1) % 12];
    
    const smoothedMean = (prev.mean + c.mean + next.mean) / 3;
    const smoothedStd = (prev.std + c.std + next.std) / 3;
    const smoothedP15 = (prev.p15 + c.p15 + next.p15) / 3;
    const smoothedP85 = (prev.p85 + c.p85 + next.p85) / 3;
    
    const mean = smoothedMean;
    const std = smoothedStd;
    const p15 = smoothedP15;
    const p85 = smoothedP85;
    
    return {
      mesObj: c.mes,
      mes: monthNames[c.mes - 1],
      media: Number(mean.toFixed(2)),
      std: Number(std.toFixed(2)),
      p15: Number(p15.toFixed(2)),
      p85: Number(p85.toFixed(2)),
      
      // Construção por empilhamento (Recharts Stacked Area):
      // A base inicia bem abaixo do P15
      negExtrema: Number(Math.max(0, p15 - 3.0 * std).toFixed(2)),
      negSevera: Number((1.0 * std).toFixed(2)),
      negModerada: Number((0.5 * std).toFixed(2)),
      negLeve: Number((0.5 * std).toFixed(2)),
      
      // Normalidade agora definida pelos percentis 15 a 85
      normal: Number((p85 - p15).toFixed(2)),
      
      posLeve: Number((0.5 * std).toFixed(2)),
      posModerada: Number((0.5 * std).toFixed(2)),
      posSevera: Number((1.0 * std).toFixed(2)),
      posExtrema: Number((3.0 * std).toFixed(2))
    };
  });
  
  return { 
    climatologia: smoothedClim,
    dataInicial: oldestDate ? oldestDate.toLocaleDateString('pt-BR') : 'N/A',
    dataFinal: newestDate ? newestDate.toLocaleDateString('pt-BR') : 'N/A',
    minHistValue: globalMin !== Infinity ? globalMin : null,
    minHistYear: globalMinDate ? globalMinDate.getFullYear() : null
  };
}
