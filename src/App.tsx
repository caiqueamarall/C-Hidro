// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, WMSTileLayer, Marker, Popup, ZoomControl, LayersControl, useMap, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import kmzFileUrl from './assets/Com4DN.kmz';
import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, ComposedChart, Area, Scatter, Legend } from 'recharts';
import { Settings, Download, Search, Layers, X, LineChart as LineChartIcon, RefreshCw, FileText, Activity, AlertTriangle, Table, Droplets, Map as MapIcon, Loader2, CloudRain, CloudLightning, Sun, HelpCircle, TrendingDown, Equal, TrendingUp, Menu, Calendar, Info, Clock, Waves } from 'lucide-react';

const CHidroLogo = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className}>
    {/* Gota centralizada e preenchida */}
    <path 
      d="M12 19C14.5 19 16.5 16.5 16.5 13.5C16.5 9.5 12 5 12 5C12 5 7.5 9.5 7.5 13.5C7.5 16.5 9.5 19 12 19Z" 
      fill="#0cd48c" 
    />
    {/* Letra C grossa e branca envolvendo a gota */}
    <path 
      d="M 18 4 A 10 10 0 1 0 18 20" 
      fill="none" 
      stroke="white" 
      strokeWidth="3.5" 
      strokeLinecap="butt" 
    />
  </svg>
);
import { motion, AnimatePresence } from 'framer-motion';
import { authenticateAna, fetchHistoricoEstacao, downloadSerieHistorica, gerarClimatologiaDaEstacao } from './anaApi';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// Helper to map Z-Score (Desvio Padrão) to our standard anomaly bands
const getAnomaliaFromZScore = (zScore: number | undefined | null, originalAnomalia: string) => {
  if (zScore === undefined || zScore === null) return originalAnomalia;
  
  if (zScore <= -2.0) return 'ANOMALIA_NEGATIVA_EXTREMA';
  if (zScore <= -1.5) return 'ANOMALIA_NEGATIVA_SEVERA';
  if (zScore <= -1.0) return 'ANOMALIA_NEGATIVA_MODERADA';
  if (zScore <= -0.5) return 'ANOMALIA_NEGATIVA_LEVE';
  if (zScore < 0.5) return 'NORMAL';
  if (zScore < 1.0) return 'ANOMALIA_POSITIVA_LEVE';
  if (zScore < 1.5) return 'ANOMALIA_POSITIVA_MODERADA';
  if (zScore < 2.0) return 'ANOMALIA_POSITIVA_SEVERA';
  return 'ANOMALIA_POSITIVA_EXTREMA';
};

// Create a custom icon function based on anomaly
const getIconProps = (anomalia: string, statusCota: number) => {
  let color = '#9e9e9e'; // default sem dados
  switch(anomalia) {
    case 'ANOMALIA_NEGATIVA_EXTREMA': color = '#d32f2f'; break;
    case 'ANOMALIA_NEGATIVA_SEVERA': color = '#f97316'; break;
    case 'ANOMALIA_NEGATIVA_MODERADA': color = '#eab308'; break;
    case 'ANOMALIA_NEGATIVA_LEVE': color = '#d9f99d'; break;
    case 'NORMAL': color = '#22c55e'; break;
    case 'ANOMALIA_POSITIVA_LEVE': color = '#93c5fd'; break;
    case 'ANOMALIA_POSITIVA_MODERADA': color = '#3b82f6'; break;
    case 'ANOMALIA_POSITIVA_SEVERA': color = '#1d4ed8'; break;
    case 'ANOMALIA_POSITIVA_EXTREMA': color = '#1e3a8a'; break;
  }

  let svg = '';
  if (statusCota === 1) { // Subindo
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline></svg>`;
  } else if (statusCota === -1) { // Descendo
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"></polyline><polyline points="16 17 22 17 22 11"></polyline></svg>`;
  } else if (statusCota === 0) { // Estável
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="9" x2="19" y2="9"></line><line x1="5" y1="15" x2="19" y2="15"></line></svg>`;
  } else {
    svg = `<span style="color:white; font-weight:bold; font-size:12px;">?</span>`;
  }
  
  return { color, svg };
};

const markerIconCache = new Map();
const getMarkerIcon = (anomalia: string, statusCota: number) => {
  const cacheKey = `${anomalia}-${statusCota}`;
  if (markerIconCache.has(cacheKey)) {
    return markerIconCache.get(cacheKey);
  }

  const { color, svg } = getIconProps(anomalia, statusCota);
  
  const icon = L.divIcon({
    className: 'custom-icon',
    html: `<div style="background-color: ${color}; width: 22px; height: 22px; border-radius: 6px; border: 1.5px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; padding: 2px;">
             ${svg}
           </div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
  
  markerIconCache.set(cacheKey, icon);
  return icon;
};

const reservatorioIconCache = new Map();
const getReservatorioIcon = (tipo: string) => {
  const isReservatorio = tipo.trim().toLowerCase() === 'reservatório';
  const cacheKey = isReservatorio ? 'reservatorio' : 'other';
  
  if (reservatorioIconCache.has(cacheKey)) {
    return reservatorioIconCache.get(cacheKey);
  }

  const icon = L.divIcon({
    className: 'custom-icon-reservatorio',
    html: `<div style="background-color: #16a34a; width: 18px; height: 18px; border-radius: ${isReservatorio ? '4px' : '50%'}; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
             <div style="background-color: white; width: 6px; height: 6px; border-radius: ${isReservatorio ? '1px' : '50%'};"></div>
           </div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
  
  reservatorioIconCache.set(cacheKey, icon);
  return icon;
};

const products = [
  { id: 'niveis_com4_principais', label: 'Níveis dos Rios Com4ºDN (Principais Hidrovias)', icon: Droplets, active: true },
  { id: 'niveis_com4', label: 'Nível dos Rios Com4ºDN', icon: Droplets, active: false },
  { id: 'niveis_amazonia', label: 'Nível dos Rios Amazônia Legal', icon: Droplets, active: false },
  { id: 'chuva', label: 'Chuva (Bacia)', icon: CloudRain, active: false },
  { id: 'estiagem', label: 'Estiagem', icon: Sun, active: false }
];

const HIDRELETRICAS = [
  { id: 'tucurui', nome: 'UHE Tucuruí', lat: -3.8333, lng: -49.6500, tipo: 'reservatorio' },
  { id: 'bmo', nome: 'UHE Belo Monte', lat: -3.1197, lng: -51.7803, tipo: 'reservatorio' },
  { id: 'st_antonio', nome: 'UHE Santo Antônio', lat: -8.8028, lng: -63.9511, tipo: 'reservatorio' },
  { id: 'jirau', nome: 'UHE Jirau', lat: -9.2611, lng: -64.6469, tipo: 'reservatorio' }
];

const GRUPOS_RIOS = [
  { nome: 'Rio Tocantins', estacoes: [{nome: 'Marabá', id: '29050000'}, {nome: 'Tucuruí'}] },
  { nome: 'Rio Xingu', estacoes: [{nome: 'Vitória do Xingu', id: '18936000'}, {nome: 'Porto de Moz'}] },
  { nome: 'Rio Tapajós', estacoes: [{nome: 'Itaituba'}, {nome: 'Santarém', id: '17900000'}] },
  { nome: 'Rio Amazonas', estacoes: [{nome: 'Óbidos'}, {nome: 'Almeirim'}] },
  { nome: 'Rio Trombetas', estacoes: [{nome: 'Estirão da Angélica'}, {nome: 'Oriximiná'}] }
];

function KmzOverlay({ url }: { url: string }) {
  const map = useMap();
  useEffect(() => {
    // Inject leaflet-kmz script
    const scriptId = 'leaflet-kmz-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement;
    
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://unpkg.com/leaflet-kmz@latest/dist/leaflet-kmz.js';
      script.async = true;
      document.head.appendChild(script);
    }
    
    const loadKmz = () => {
      if ((window as any).L && (window as any).L.kmzLayer) {
        const kmz = (window as any).L.kmzLayer().addTo(map);
        kmz.on('load', function(e: any) {
          e.layer.eachLayer((layer: any) => {
            if (layer.unbindPopup) layer.unbindPopup();
            if (layer.unbindTooltip) layer.unbindTooltip();
            if (layer.options) layer.options.interactive = false;
            if (layer.setStyle) layer.setStyle({ fillOpacity: 0, color: '#ef4444', weight: 2 });
            if (layer.getElement && layer.getElement()) {
              layer.getElement().style.pointerEvents = 'none';
            }
            if (layer._path) {
              layer._path.style.pointerEvents = 'none';
              layer._path.classList.remove('leaflet-interactive');
              layer._path.classList.add('kmz-non-interactive');
            }
          });
        });
        kmz.load(url);
      } else {
        setTimeout(loadKmz, 500); // Tenta de novo se a lib não injetou no L ainda
      }
    };
    
    script.addEventListener('load', loadKmz);
    
    if ((window as any).L && (window as any).L.kmzLayer) {
      loadKmz();
    }
    
    return () => {
      script.removeEventListener('load', loadKmz);
    };
  }, [map, url]);
  
  return null;
}

class ErrorBoundary extends React.Component<{children: any}, {hasError: boolean, error: any}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-10 text-red-600 font-bold bg-red-50 h-screen w-full whitespace-pre-wrap overflow-auto z-[9999] absolute inset-0">
          ERRO FATAL NO REACT: {this.state.error?.message}
          {'\n\n'}
          {this.state.error?.stack}
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<'produtos' | 'boletins' | 'prognostico' | 'resumo' | 'comparativos'>('produtos');
  const [activeProduct, setActiveProduct] = useState('niveis_com4_principais');
  const [estacoes, setEstacoes] = useState<any[]>([]);
  const [hidreletricas, setHidreletricas] = useState<any[]>([]);
  
  // Boletim states
  const [selectedStationId, setSelectedStationId] = useState<number | ''>('');
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  
  // Chuva Mosaico states
  const [baciasGeoJson, setBaciasGeoJson] = useState<any>(null);
  const [chuvaOpacity, setChuvaOpacity] = useState<number>(100);
  const [selectedBacia, setSelectedBacia] = useState<any>(null);
  const [baciaChuvaData, setBaciaChuvaData] = useState<any>(null);
  const [chuvaViewType, setChuvaViewType] = useState<string>('GRADE');
  const [estimador, setEstimador] = useState<string>('NOAA');
  const [chuvaDate, setChuvaDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const onBaciaClick = (feature: any, layer: any) => {
    layer.on({
      click: async (e: any) => {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        setSelectedBacia({ feature, latlng: { lat, lng } });
        setBaciaChuvaData(null);
        try {
          const cobacia = feature.properties.codigo_sub_bacia || feature.properties.cobacia || '0';
          const response = await fetch(`http://127.0.0.1:8000/api/subbacia/${cobacia}/chuva?lat=${lat}&lng=${lng}&date=${chuvaDate}&estimador=${estimador}`);
          const d = await response.json();
          setBaciaChuvaData(d);
        } catch (error) {
          console.error(error);
        }
      }
    });
  };

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/bacias')
      .then(res => res.json())
      .then(data => {
        if (!data.error) setBaciasGeoJson(data);
      })
      .catch(console.error);
  }, []);

  // Download Modal states
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [downloadStartDate, setDownloadStartDate] = useState('');
  const [downloadEndDate, setDownloadEndDate] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Prognostico states
  const [progStationId, setProgStationId] = useState<number | ''>('');
  const [progDataType, setProgDataType] = useState<'cota' | 'chuva'>('cota');
  const [progData, setProgData] = useState<any[]>([]);
  const [isProgLoading, setIsProgLoading] = useState(false);
  const [progProgress, setProgProgress] = useState(0);
  const [progDataInicial, setProgDataInicial] = useState<string>('');
  const [progDataFinal, setProgDataFinal] = useState<string>('');
  const [progMinHistValue, setProgMinHistValue] = useState<number | null>(null);
  const [progMinHistYear, setProgMinHistYear] = useState<number | null>(null);
  const [progCotaAtual, setProgCotaAtual] = useState<number | null>(null);
  // Mini-chart for popups
  const getPopupData = (cotaAtual: number) => {
    const base = cotaAtual || 500;
    return Array.from({length: 5}).map((_, i) => ({
      date: `D-${5-i}`,
      cota: base + (Math.random() * 10 - 5)
    }));
  };

  // El Nino Comparativo states
  const [elninoStationId, setElninoStationId] = useState<number | ''>('');
  const [elninoEvents, setElninoEvents] = useState<any>({
    'JUN2023-MAI2024': true,
    'OUT2018-JUL2019': false,
    'OUT2015-JUL2016': true,
    'OUT2009-JUL2010': false,
    'OUT1997-JUL1998': false,
    'OUT1982-JUL1983': false
  });
  const [elninoData, setElninoData] = useState<any[]>([]);
  const [isElninoLoading, setIsElninoLoading] = useState(false);
  const [elninoProgress, setElninoProgress] = useState(0);
  const [elninoBaseYear, setElninoBaseYear] = useState<number>(new Date().getFullYear());

  // Secas Mode states
  const [comparativoMode, setComparativoMode] = useState<'elnino' | 'secas'>('elnino');
  const [secasStationId, setSecasStationId] = useState<number | ''>('');
  const [secasData, setSecasData] = useState<any[]>([]);
  const [secasCurrentY, setSecasCurrentY] = useState<number>(new Date().getFullYear());
  const [isSecasLoading, setIsSecasLoading] = useState(false);
  const [secasProgress, setSecasProgress] = useState(0);
  const SECAS_STATIONS = [17050001, 17900000, 17730000, 29050000, 19152500];
  const SECAS_YEARS = [2024, 2023, 2019, 2018, 2016, 2015];
  const [secasYearsSelected, setSecasYearsSelected] = useState<number[]>([]);

  const handlePlotElnino = async () => {
    if (!elninoStationId) return;
    
    const periodsToFetch = Object.entries(elninoEvents)
                                 .filter(([key, val]) => val)
                                 .map(([key, val]) => key);
                                 
    if (periodsToFetch.length === 0) return;

    setIsElninoLoading(true);
    setElninoData([]);
    setElninoProgress(5);
    
    try {
        const monthMap: Record<string, number> = { 'JAN':1, 'FEV':2, 'MAR':3, 'ABR':4, 'MAI':5, 'JUN':6, 'JUL':7, 'AGO':8, 'SET':9, 'OUT':10, 'NOV':11, 'DEZ':12 };
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        
        let minAbs = 999;
        let maxAbs = -999;
        
        const parsedEvents = periodsToFetch.map(p => {
            const parts = p.split('-');
            const m1Str = parts[0].substring(0,3);
            const y1 = parseInt(parts[0].substring(3));
            const m2Str = parts[1].substring(0,3);
            const y2 = parseInt(parts[1].substring(3));
            
            const m1 = monthMap[m1Str];
            const m2 = monthMap[m2Str];
            
            const abs1 = m1; 
            const abs2 = (y2 - y1) * 12 + m2;
            
            if (abs1 < minAbs) minAbs = abs1;
            if (abs2 > maxAbs) maxAbs = abs2;
            
            return { p, m1, y1, m2, y2, abs1, abs2 };
        });
        
        // Default to Jun-Mai if somehow invalid
        if (minAbs === 999) { minAbs = 6; maxAbs = 17; }
        
        const baseChart: any[] = [];
        for (let abs = minAbs; abs <= maxAbs; abs++) {
            const yOffset = Math.floor((abs - 1) / 12);
            const m = ((abs - 1) % 12) + 1;
            baseChart.push({
                absMonth: abs,
                month: m,
                yearOffset: yOffset,
                label: monthNames[m - 1]
            });
        }
        
        try {
          const docSnap = await getDoc(doc(db, 'api_historico', elninoStationId.toString()));
          if (!docSnap.exists()) {
            console.error("Historical data not found in Firebase");
            setIsElninoLoading(false);
            return;
          }
          const hist = docSnap.data();
           
           try {
               const now = new Date();
               const datesToFetch: string[] = [];
               for (let i = 0; i < 6; i++) {
                   const d = new Date(now);
                   d.setDate(d.getDate() - (i * 30));
                   datesToFetch.push(d.toISOString().split('T')[0]);
               }
               
               const promises = datesToFetch.map(date => fetchHistoricoEstacao(Number(elninoStationId), 'DIAS_30', date));
               const results = await Promise.all(promises);
               
               let liveAnaItems: any[] = [];
               results.forEach(items => {
                   if (items && items.length > 0) {
                       liveAnaItems.push(...items);
                   }
               });
               if (liveAnaItems && liveAnaItems.length > 0) {
                  if (!hist.historico_recente) hist.historico_recente = [];
                  liveAnaItems.forEach((anaItem: any) => {
                     const cotaVal = parseFloat(anaItem.Cota_Sensor || anaItem.Cota_Adotada || '0');
                     if (anaItem.Data_Hora_Medicao && cotaVal > 0) {
                        const formattedDate = anaItem.Data_Hora_Medicao.replace(' ', 'T').substring(0, 19);
                        const existingIndex = hist.historico_recente.findIndex((r: any) => r.data.substring(0,10) === formattedDate.substring(0,10));
                        if (existingIndex !== -1) {
                           hist.historico_recente[existingIndex].cota = cotaVal;
                        } else {
                           hist.historico_recente.push({ data: formattedDate, cota: cotaVal });
                        }
                     }
                  });
                  hist.historico_recente.sort((a: any, b: any) => new Date(a.data).getTime() - new Date(b.data).getTime());
               }
           } catch(e) {
               console.error("Erro ao buscar dados recentes da ANA:", e);
           }
           const clim = hist.climatologia || []; 
           baseChart.forEach(row => {
               const c = clim.find((c: any) => c.mes === row.month);
               if (c) row['Média Histórica'] = c.media;
           });
           
           const curData = hist.historico_recente || [];
           let currentYearStart = new Date().getFullYear();
           
           if (curData.length > 0) {
               const lastRecord = curData[curData.length - 1];
               if (lastRecord.data) {
                   const lastY = parseInt(lastRecord.data.substring(0, 4));
                   const lastM = parseInt(lastRecord.data.substring(5, 7));
                   currentYearStart = lastM >= minAbs ? lastY : lastY - 1;
               }
           } else {
               const now = new Date();
               currentYearStart = (now.getMonth() + 1) >= minAbs ? now.getFullYear() : now.getFullYear() - 1;
           }
           
           setElninoBaseYear(currentYearStart);
           
           curData.forEach((d: any) => {
               if (d.cota && d.data) {
                   const y = parseInt(d.data.substring(0,4));
                   const m = parseInt(d.data.substring(5,7));
                   
                   const yOffset = y - currentYearStart;
                   if (yOffset >= 0 && yOffset <= 1) {
                       const abs = yOffset * 12 + m;
                       const row = baseChart.find(r => r.absMonth === abs);
                       if (row) {
                          if (!row.curSum) { row.curSum = 0; row.curCount = 0; }
                          row.curSum += d.cota;
                          row.curCount += 1;
                       }
                   }
               }
           });
           
           baseChart.forEach(row => {
               if (row.curCount) {
                 row['Ano Corrente'] = row.curSum / row.curCount;
                 delete row.curSum;
                 delete row.curCount;
               }
           });
        } catch (error) {
            console.error("Error fetching historical context for El Nino:", error);
        }
        
        let prog = 20;
        const progStep = parsedEvents.length > 0 ? 80 / parsedEvents.length : 80;
        
        for (const ev of parsedEvents) {
            const fetchY1 = ev.y1;
            const fetchY2 = ev.y2;
            const fetchM1 = ev.m1.toString().padStart(2, '0');
            const fetchM2 = ev.m2.toString().padStart(2, '0');
            
            const docId = `${elninoStationId}_${fetchY1}`;
            const docSnap = await getDoc(doc(db, 'api_elnino', docId));
            if (docSnap.exists()) {
                const data = docSnap.data();
                data.dados.forEach((d: any) => {
                    if (d.cota && d.data) {
                        const y = parseInt(d.data.substring(0,4));
                        const m = parseInt(d.data.substring(5,7));
                        
                        const yOffset = y - ev.y1;
                        const abs = yOffset * 12 + m;
                        
                        const row = baseChart.find(r => r.absMonth === abs);
                        if (row) {
                            const sumKey = `${ev.p}_sum`;
                            const countKey = `${ev.p}_count`;
                            if (!row[sumKey]) { row[sumKey] = 0; row[countKey] = 0; }
                            row[sumKey] += d.cota;
                            row[countKey] += 1;
                        }
                    }
                });
                
                baseChart.forEach(row => {
                    if (row[`${ev.p}_count`]) {
                       row[ev.p] = row[`${ev.p}_sum`] / row[`${ev.p}_count`];
                       delete row[`${ev.p}_sum`];
                       delete row[`${ev.p}_count`];
                    }
                });
            }
            prog += progStep;
            setElninoProgress(Math.floor(prog));
        }
        
        setElninoData(baseChart);
    } catch(e) {
        console.error(e);
        alert("Erro ao buscar dados do El Niño.");
    } finally {
        setIsElninoLoading(false);
        setElninoProgress(100);
    }
  };

  const handlePlotSecas = async () => {
    if (!secasStationId) return;
    setIsSecasLoading(true);
    setSecasProgress(0);

    try {
        const baseChart: any[] = [];
        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        for (let i = 0; i < 12; i++) {
            baseChart.push({
                month: months[i],
                monthNum: i + 1,
            });
        }

        try {
          const docSnap = await getDoc(doc(db, 'api_historico', secasStationId.toString()));
          if (!docSnap.exists()) {
            console.error("Historical fetch failed for Secas");
            setIsSecasLoading(false);
            return;
          }
          const hist = docSnap.data();
          const clim = hist.climatologia || []; 
            baseChart.forEach(row => {
                const c = clim.find((c: any) => c.mes === row.monthNum);
                if (c) row['Média Histórica'] = c.media;
            });

            const curData = hist.historico_recente || [];
            
            let currentY = new Date().getFullYear();
            setSecasCurrentY(currentY);
            
            try {
                const dataInicialStr = `${currentY}-01-01`;
                const dataFinalStr = `${currentY}-12-31`;
                
                const { data } = await downloadSerieHistorica(Number(secasStationId), dataInicialStr, dataFinalStr);
                
                if (data && data.length > 0) {
                    data.forEach((anaItem: any) => {
                        const cotaVal = parseFloat(anaItem.Cota_Sensor || anaItem.Cota_Adotada || '0');
                        if (anaItem.Data_Hora_Medicao && cotaVal > 0) {
                            const formattedDate = anaItem.Data_Hora_Medicao.replace(' ', 'T').substring(0, 19);
                            const existingIndex = curData.findIndex((r: any) => r.data.substring(0,10) === formattedDate.substring(0,10));
                            if (existingIndex !== -1) {
                                curData[existingIndex].cota = cotaVal;
                            } else {
                                curData.push({ data: formattedDate, cota: cotaVal });
                            }
                        }
                    });
                }
            } catch (err) {
                console.error("Erro ao buscar dados telemetria da ANA (Secas):", err);
            }
            
            curData.forEach((d: any) => {
                if (d.cota && d.data) {
                    const y = parseInt(d.data.substring(0,4));
                    const m = parseInt(d.data.substring(5,7));
                    if (y === currentY) {
                        const row = baseChart.find(r => r.monthNum === m);
                        if (row) {
                            if (!row.curSum) { row.curSum = 0; row.curCount = 0; }
                            row.curSum += d.cota;
                            row.curCount += 1;
                        }
                    }
                }
            });
            
            baseChart.forEach(row => {
                if (row.curCount) {
                  row['Ano Corrente'] = row.curSum / row.curCount;
                  delete row.curSum;
                  delete row.curCount;
                }
            });
        } catch (error) {
            console.error("Error fetching historical context for Secas:", error);
        }

        let prog = 20;
        const progStep = secasYearsSelected.length > 0 ? 80 / secasYearsSelected.length : 80;

        for (const year of secasYearsSelected) {
            const docId = `${secasStationId}_${year}`;
            const docSnap = await getDoc(doc(db, 'api_elnino', docId));
            if (docSnap.exists()) {
                const data = docSnap.data();
                data.dados.forEach((d: any) => {
                    if (d.cota && d.data) {
                        const m = parseInt(d.data.substring(5,7));
                        const row = baseChart.find(r => r.monthNum === m);
                        if (row) {
                           if (!row[`sum_${year}`]) { row[`sum_${year}`] = 0; row[`count_${year}`] = 0; }
                           row[`sum_${year}`] += d.cota;
                           row[`count_${year}`] += 1;
                        }
                    }
                });
            }
            prog += progStep;
            setSecasProgress(Math.round(prog));
        }

        baseChart.forEach(row => {
            for (const year of secasYearsSelected) {
                if (row[`count_${year}`]) {
                    row[year.toString()] = row[`sum_${year}`] / row[`count_${year}`];
                    delete row[`sum_${year}`];
                    delete row[`count_${year}`];
                }
            }
        });

        setSecasData(baseChart);
    } catch(e) {
        console.error(e);
    }
    setIsSecasLoading(false);
  };

  const processAnaData = (items: any[]) => {
    const dailyMap = new Map<string, { cota: number, vazao: number }>();
    
    items.forEach(item => {
      const dateStr = item.Data_Hora_Medicao;
      const cota = parseFloat(item.Cota_Sensor || item.Cota_Adotada || '0');
      const vazao = parseFloat(item.Vazao_Sensor || item.Vazao_Adotada || '0');
      
      if (!dateStr || isNaN(cota) || cota === 0) return;
      
      const day = dateStr.split(' ')[0]; // "2026-07-24"
      if (!dailyMap.has(day)) {
        dailyMap.set(day, { cota, vazao: isNaN(vazao) ? 0 : vazao });
      }
    });

    const processed = [];
    let previousCota: number | null = null;
    const sortedDays = Array.from(dailyMap.keys()).sort();
    
    for (const day of sortedDays) {
      const { cota, vazao } = dailyMap.get(day)!;
      const [, month, dateDay] = day.split('-');
      
      let variacao = 0;
      if (previousCota !== null) {
        variacao = Number((cota - previousCota).toFixed(2));
      }
      previousCota = cota;
      
      processed.push({
        date: `${dateDay}/${month}`,
        cota: cota,
        vazao: vazao,
        variacao: variacao,
        originalDate: day
      });
    }
    
    return processed;
  };

  useEffect(() => {
    authenticateAna();
    
    fetch('estacoes.json')
      .then(res => res.json())
      .then(data => {
        const processedData = data.map((est: any) => ({
          ...est,
          anomalia_censipam: est.anomalia,
          anomalia: (est.zScore !== undefined && est.zScore !== null) 
            ? getAnomaliaFromZScore(est.zScore, est.anomalia) 
            : est.anomalia
        }));
        setEstacoes(processedData);
        if (processedData.length > 0) setSelectedStationId(processedData[0].codigo);
      })
      .catch(err => console.error("Error fetching data:", err));
      
    fetch('https://apihidro.sipam.gov.br/hidreletricas/')
      .then(res => res.json())
      .then(data => setHidreletricas(data))
      .catch(err => console.error("Error fetching hidreletricas:", err));
  }, []);

  useEffect(() => {
    if (!selectedStationId) return;
    
    // A API da ANA é instável quando não passamos a Data de Busca, então passamos a data de hoje.
    const d = new Date();
    fetchHistoricoEstacao(Number(selectedStationId), 'DIAS_14', d.toISOString().split('T')[0])
      .then(items => {
        if (items && items.length > 0) {
          const processed = processAnaData(items);
          setHistoricalData(processed);
        } else {
          // Em vez de dados falsos, usamos a cota mais recente disponível no mapa (se existir)
          const currentStation = estacoes.find(e => String(e.codigo) === String(selectedStationId));
          if (currentStation && currentStation.cotaUltimaMedicao) {
            setHistoricalData([{
              date: new Date().toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'}),
              cota: Number((currentStation.cotaUltimaMedicao * 100).toFixed(2)),
              vazao: 0,
              variacao: 0
            }]);
          } else {
            setHistoricalData([]);
          }
        }
      })
      .catch(err => {
         console.error("Erro ao buscar histórico da ANA:", err);
         setHistoricalData([]);
      });
  }, [selectedStationId]);

  const openDownloadModal = () => {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - 3);
    
    setDownloadEndDate(end.toISOString().split('T')[0]);
    setDownloadStartDate(start.toISOString().split('T')[0]);
    setDownloadProgress(0);
    setIsDownloadModalOpen(true);
  };

  const executeHistoricalDownload = async () => {
    if (!selectedStationId || !downloadStartDate || !downloadEndDate) return;
    
    setIsDownloading(true);
    setDownloadProgress(0);
    
    try {
      const result = await downloadSerieHistorica(
        Number(selectedStationId), 
        downloadStartDate, 
        downloadEndDate, 
        (progress) => setDownloadProgress(progress)
      );
      
      const data = result.data;
      
      if (data.length === 0) {
        alert("A estação selecionada não possui dados registrados na base da ANA.");
        setIsDownloading(false);
        return;
      }
      
      if (result.isFallback) {
        alert("Não encontramos dados exatamente no período solicitado. Para não te deixar de mãos vazias, o arquivo CSV foi gerado com os 30 dias mais recentes disponíveis para esta estação!");
      }
      
      const headers = ['Data Hora', 'Cota Sensor', 'Vazão Sensor', 'Chuva Acumulada', 'Bateria'];
      const rows = data.map(d => [
        d.Data_Hora_Medicao || '',
        d.Cota_Sensor || d.Cota_Adotada || '',
        d.Vazao_Sensor || d.Vazao_Adotada || '',
        d.Chuva_Acumulada || '',
        d.Bateria || ''
      ]);
      
      const csvContent = "data:text/csv;charset=utf-8," 
        + headers.join(',') + "\n" 
        + rows.map(e => e.join(",")).join("\n");
        
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `historico_${selectedStationId}_completo.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setIsDownloadModalOpen(false);
    } catch (error) {
      alert("Erro ao baixar histórico");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleGeneratePrognostico = async () => {
    if (!progStationId) return;
    setIsProgLoading(true);
    setProgProgress(0);
    setProgCotaAtual(null); // RESET
    try {
      const endpoint = progDataType === 'cota' ? 'api_historico' : 'api_chuva';
      
      const docSnap = await getDoc(doc(db, endpoint, String(progStationId)));
      if (!docSnap.exists()) {
        throw new Error(`A estação não possui dados históricos de ${progDataType === 'cota' ? 'Nível (Cota)' : 'Chuva'} na base.`);
      }
      const response = docSnap.data();

      const clim = response.climatologia || []; 
      setProgDataInicial(response.estatisticas?.ano_inicio?.toString() || 'Histórico');
      setProgDataFinal(response.estatisticas?.ano_fim?.toString() || new Date().getFullYear().toString());      
      setProgMinHistValue(response.estatisticas?.minimo_absoluto ?? null);
      setProgMinHistYear(response.estatisticas?.ano_minimo ?? null);
      setProgProgress(85);
      
      const currData = response.historico_recente; // [{data, cota, vazao}]
      
      setProgProgress(90);
      let telemetryData: any[] = [];
      try {
        const d1 = new Date();
        const d2 = new Date(); d2.setDate(d2.getDate() - 30);
        const d3 = new Date(); d3.setDate(d3.getDate() - 60);
        
        // Fazemos 3 requisições de 30 dias sequencialmente. 
        // Foi comprovado que a API da ANA responde bem a blocos de 30 dias com Data de Busca especificada.
        // Fazer sequencial evita bloqueios de Rate Limit nos proxies gratuitos.
        const p1 = await fetchHistoricoEstacao(Number(progStationId), 'DIAS_30', d1.toISOString().split('T')[0]);
        const p2 = await fetchHistoricoEstacao(Number(progStationId), 'DIAS_30', d2.toISOString().split('T')[0]);
        const p3 = await fetchHistoricoEstacao(Number(progStationId), 'DIAS_30', d3.toISOString().split('T')[0]);
        
        telemetryData = [...(p1||[]), ...(p2||[]), ...(p3||[])];
      } catch(e) {
        console.error("Telemetry failed", e);
      }
      
      const telemetryMonthlyMeans = new Map<string, number>();
      if (telemetryData && telemetryData.length > 0) {
         const telemetryMap = new Map<string, {sum: number, count: number}>();
         telemetryData.forEach((t: any) => {
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
         });
      }
      
      // Remove the old year calculation and just use strictly mapped dates
      const now = new Date();
      
      setProgProgress(95);
      
      setProgProgress(95);
      
      // Começa 2 meses atrás em relação à data de hoje
      const startMonthIndex = (now.getMonth() - 2 + 12) % 12;
      
      // --- CÁLCULO DA INÉRCIA ATUAL (Z-SCORE) ---
      let zAtual = 0;
      
      // Procura o dado mais recente do ano corrente para extrair o Z-Score atual
      let currentMonthOffset = 2; // offset 2 = mês atual
      
      // Calculate current value
      const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      let actualValue: number | null = null;
      
      const estacaoCorrente = [...estacoes].reverse().find(e => String(e.codigo) === String(progStationId));
      
      if (progDataType === 'cota') {
          // Sempre priorizar a medição mais recente (exata) para bater com a tabela e mapa
          actualValue = estacaoCorrente?.cotaUltimaMedicao ?? null;
          if (actualValue === null) {
             actualValue = telemetryMonthlyMeans.get(nowKey) ?? null;
          }
      } else {
          // Para chuva, busca no banco histórico consolidado (diário) em vez da telemetria de 15min
          const dataMesCorrente = currData.filter((item: any) => {
               if (!item.data) return false;
               const year = parseInt(item.data.substring(0, 4), 10);
               const month = parseInt(item.data.substring(5, 7), 10);
               return year === now.getFullYear() && month === (now.getMonth() + 1);
          });
          if (dataMesCorrente.length > 0) {
               actualValue = dataMesCorrente.reduce((acc: number, val: any) => acc + (val.chuva || 0), 0);
          } else {
               // Se não tem no banco, zera (mês sem chuva reportada)
               actualValue = 0;
          }
      }
      
      if (actualValue !== null) {
          const baseClim = clim[now.getMonth()];
          if (baseClim) {
              zAtual = (actualValue - baseClim.media) / baseClim.std;
          }
          setProgCotaAtual(actualValue);
      }
      
      const rollingClim = [];
      let mesesNoFuturo = 0;
      
      for (let offset = 0; offset < 14; offset++) {
        const monthIndex = (startMonthIndex + offset) % 12;
        const baseClim = clim.find((c: any) => c.mes === monthIndex + 1) || { media: 0, std: 1, p15: 0, p85: 0 };
        
        const datePoint = new Date(now.getFullYear(), now.getMonth() - 2 + offset, 1);
        const yyyy = datePoint.getFullYear();
        const mm = String(datePoint.getMonth() + 1).padStart(2, '0');
        const mesAnoLabel = `${mm}/${yyyy}`;
        
        const isFuture = offset > 2; // offset 2 is current month
        const monthNum = monthIndex + 1;
        
        let obsValue: number | null = null;
        const telemetryKey = `${yyyy}-${mm}`;
        
        // 1. Tenta pegar da Telemetria de 90 dias (Apenas para COTA)
        if (progDataType === 'cota') {
            // Usa a média do mês (se disponível) ao invés do valor instantâneo para o mês corrente
            if (yyyy === now.getFullYear() && monthIndex === now.getMonth()) {
                const medMes = estacaoCorrente?.cotaRegua?.cotaMedia ?? estacaoCorrente?.media_historica_mes ?? estacaoCorrente?.media_mes ?? estacaoCorrente?.cotaMediaMes ?? estacaoCorrente?.cotaUltimaMedicao;
                if (medMes != null) {
                   // A API Sipam retorna a média em cm, igual à cotaUltimaMedicao
                   obsValue = medMes;
                }
            } else if (telemetryMonthlyMeans.has(telemetryKey)) {
                obsValue = telemetryMonthlyMeans.get(telemetryKey) as number;
            } else {
                const dataMes = currData.filter((item: any) => {
                   if (!item.data) return false;
                   const year = parseInt(item.data.substring(0, 4), 10);
                   const month = parseInt(item.data.substring(5, 7), 10);
                   return year === yyyy && month === monthNum;
                });
                if (dataMes.length > 0) {
                   const sum = dataMes.reduce((acc: number, val: any) => acc + (val.cota || 0), 0);
                   obsValue = sum / dataMes.length;
                }
            }
        } else {
            // 2. Se for chuva
            const dataMes = currData.filter((item: any) => {
               if (!item.data) return false;
               const year = parseInt(item.data.substring(0, 4), 10);
               const month = parseInt(item.data.substring(5, 7), 10);
               return year === yyyy && month === monthNum;
            });
            if (dataMes.length > 0) {
               const sum = dataMes.reduce((acc: number, val: any) => acc + (val.chuva || 0), 0);
               obsValue = sum;
            }
        }
        
        // 3. Fallback extremo pro Sipam se falhar TUDO no mês corrente
        let cotaRealTime = null;
        if (progDataType === 'cota') {
            cotaRealTime = estacaoCorrente?.cotaDataAtual?.media || estacaoCorrente?.cotaRegua?.media || estacaoCorrente?.cotaUltimaMedicao || null;
        }
        
        if (obsValue === null && offset === 2 && cotaRealTime) {
           obsValue = cotaRealTime;
        }
        
        let mod1 = null;
        let mod2 = null;
        
        if (isFuture) {
          mesesNoFuturo += 1;
          
          // Modelo 1: Cenário Persistente (Inércia mantida)
          mod1 = baseClim.media + (zAtual * baseClim.std);
          
          // Modelo 2: Cenário Atenuado (Reversão à Média com decaimento de 30% a.m.)
          const zAtenuado = zAtual * Math.pow(0.7, mesesNoFuturo);
          mod2 = baseClim.media + (zAtenuado * baseClim.std);
        }
        
        // Ponto de ancoragem visual (conecta a linha real com a previsão)
        if (offset === 2 && obsValue !== null) {
            mod1 = obsValue;
            mod2 = obsValue;
        }
        
        // Calculate standard deviation properly
        const std = baseClim.std || ((baseClim.p85 - baseClim.p15) / 2) || 1;
        const media = baseClim.media;
        
        // As anomalias no gráfico são empilhadas (stacked). 
        // Para que fiquem alinhadas com o z-score, os blocos devem ter a altura exata dos intervalos de desvio padrão.
        const heightExtrema = Math.max(0, media - 2.0 * std);
        const heightBand = 0.5 * std;
        
        rollingClim.push({
          mes: mesAnoLabel,
          media: Number(media.toFixed(2)),
          observado: !isFuture && obsValue !== null ? Number(obsValue.toFixed(2)) : null,
          modelo1: mod1 !== null ? Number(mod1.toFixed(2)) : null,
          modelo2: mod2 !== null ? Number(mod2.toFixed(2)) : null,
          // Valores absolutos para formar os blocos de Range Area (sem stackId)
          negExtrema: [Number((media - 3.0 * std).toFixed(2)), Number((media - 2.0 * std).toFixed(2))],
          negSevera: [Number((media - 2.0 * std).toFixed(2)), Number((media - 1.5 * std).toFixed(2))],
          negModerada: [Number((media - 1.5 * std).toFixed(2)), Number((media - 1.0 * std).toFixed(2))],
          negLeve: [Number((media - 1.0 * std).toFixed(2)), Number((media - 0.5 * std).toFixed(2))],
          normal: [Number((media - 0.5 * std).toFixed(2)), Number((media + 0.5 * std).toFixed(2))],
          posLeve: [Number((media + 0.5 * std).toFixed(2)), Number((media + 1.0 * std).toFixed(2))],
          posModerada: [Number((media + 1.0 * std).toFixed(2)), Number((media + 1.5 * std).toFixed(2))],
          posSevera: [Number((media + 1.5 * std).toFixed(2)), Number((media + 2.0 * std).toFixed(2))],
          posExtrema: [Number((media + 2.0 * std).toFixed(2)), Number((media + 3.0 * std).toFixed(2))],
          // Valores reais (limiares) para mostrar no Tooltip corretamente
          lim_negExtrema: Number(heightExtrema.toFixed(2)),
          lim_negSevera: Number((media - 1.5 * std).toFixed(2)),
          lim_negModerada: Number((media - 1.0 * std).toFixed(2)),
          lim_negLeve: Number((media - 0.5 * std).toFixed(2)),
          lim_normal: Number((media + 0.5 * std).toFixed(2)),
          lim_posLeve: Number((media + 1.0 * std).toFixed(2)),
          lim_posModerada: Number((media + 1.5 * std).toFixed(2)),
          lim_posSevera: Number((media + 2.0 * std).toFixed(2)),
          lim_posExtrema: Number((media + 3.0 * std).toFixed(2)),
        });
      }
      
      // Post-process para garantir que as extremidades pintem até o topo/fundo do gráfico sem limites extremos
      let rawMin = Infinity;
      let rawMax = -Infinity;
      rollingClim.forEach(d => {
         const minVal = Math.min(d.negExtrema[0], d.observado ?? Infinity);
         const maxVal = Math.max(d.posExtrema[1], d.observado ?? -Infinity);
         if (minVal < rawMin) rawMin = minVal;
         if (maxVal > rawMax) rawMax = maxVal;
      });
      
      // Arredonda para a centena mais próxima
      const yAxisMin = Math.floor(rawMin / 100) * 100;
      const yAxisMax = Math.ceil(rawMax / 100) * 100;
      
      rollingClim.forEach(d => {
         // Força as bandas extremas a tocarem exatamente os limites do Y-axis
         d.negExtrema[0] = yAxisMin;
         d.posExtrema[1] = yAxisMax;
      });
      
      setProgData(rollingClim);
      setProgProgress(100);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Erro ao gerar prognóstico.");
    } finally {
      setIsProgLoading(false);
    }
  };

  const hasVazao = historicalData.some(d => d.vazao > 0);
  
  // Deduplicate by codigo and sort alphabetically for all dropdowns
  const uniqueEstacoes = Array.from(new Map(estacoes.map(e => [e.codigo, e])).values())
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      {/* Primary Vertical Nav */}
      <nav className="w-24 bg-[#f8f9fa] flex flex-col h-full border-r border-slate-200 z-30">
        <div className="h-28 bg-[#424242] flex flex-col items-center justify-center p-2 shadow-md">
          <CHidroLogo className="w-10 h-10 text-[#0cd48c]" />
          <div className="text-white text-center leading-tight mt-1">
            <span className="text-[14px] font-bold"><span className="text-[#0cd48c]">C-</span>Hidro</span>
          </div>
        </div>

        <button 
          onClick={() => setActiveTab('produtos')}
          className={`py-5 flex flex-col items-center justify-center gap-2 border-b border-slate-200 transition-colors ${activeTab === 'produtos' ? 'bg-white text-[#008744] font-bold border-l-4 border-l-[#008744]' : 'text-slate-500 hover:bg-slate-100 border-l-4 border-l-transparent font-medium'}`}
        >
          <Droplets className="w-7 h-7" />
          <span className="text-[12px]">Produtos</span>
        </button>
        
        <button 
          onClick={() => setActiveTab('boletins')}
          className={`py-5 flex flex-col items-center justify-center gap-2 border-b border-slate-200 transition-colors ${activeTab === 'boletins' ? 'bg-white text-[#008744] font-bold border-l-4 border-l-[#008744]' : 'text-slate-500 hover:bg-slate-100 border-l-4 border-l-transparent font-medium'}`}
        >
          <FileText className="w-7 h-7" />
          <span className="text-[12px]">Boletins</span>
        </button>
        
        <button 
          onClick={() => setActiveTab('prognostico')}
          className={`py-5 flex flex-col items-center justify-center gap-2 border-b border-slate-200 transition-colors ${activeTab === 'prognostico' ? 'bg-white text-[#008744] font-bold border-l-4 border-l-[#008744]' : 'text-slate-500 hover:bg-slate-100 border-l-4 border-l-transparent font-medium'}`}
        >
          <LineChartIcon className="w-7 h-7" />
          <span className="text-[12px]">Prognóstico</span>
        </button>
        
        <button 
          onClick={() => setActiveTab('resumo')}
          className={`py-5 flex flex-col items-center justify-center gap-2 border-b border-slate-200 transition-colors ${activeTab === 'resumo' ? 'bg-white text-[#008744] font-bold border-l-4 border-l-[#008744]' : 'text-slate-500 hover:bg-slate-100 border-l-4 border-l-transparent font-medium'}`}
        >
          <Table className={`w-6 h-6 ${activeTab === 'resumo' ? 'text-[#008744]' : 'text-slate-400'}`} />
          <span className="text-[10px] uppercase tracking-wider">Resumo</span>
        </button>
        <button 
          onClick={() => setActiveTab('comparativos')}
          className={`py-5 flex flex-col items-center justify-center gap-2 border-b border-slate-200 transition-colors ${activeTab === 'comparativos' ? 'bg-white text-[#008744] font-bold border-l-4 border-l-[#008744]' : 'text-slate-500 hover:bg-slate-100 border-l-4 border-l-transparent font-medium'}`}
        >
          <Layers className={`w-6 h-6 ${activeTab === 'comparativos' ? 'text-[#008744]' : 'text-slate-400'}`} />
          <span className="text-[10px] uppercase tracking-wider">Comparativos</span>
        </button>
        
      </nav>

      {/* Secondary Panel / Menu Lateral */}
      <aside className="w-72 bg-white shadow-2xl z-20 flex flex-col h-full border-r border-slate-200">


        {activeTab === 'produtos' && (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 px-2">Produtos</h2>
            
              {products.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveProduct(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    activeProduct === item.id 
                      ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100 font-semibold' 
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${activeProduct === item.id ? 'text-blue-600' : 'text-slate-400'} flex-shrink-0`} />
                  <span className="text-[13px] leading-tight text-left font-medium">{item.label}</span>
                </button>
              ))}
            </div>
            
            {/* MAP LEGEND (Moved to bottom of sidebar, smaller) */}
            {activeProduct.startsWith('niveis') && (
              <div className="p-4 border-t border-slate-200 bg-slate-50">
                <h3 className="text-[11px] font-bold text-slate-700 mb-2">Legenda</h3>
                
                {/* Color Bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-[8px] font-bold text-slate-700 mb-1 px-2">
                    <span>Anomalias (-)</span>
                    <span>Anomalias (+)</span>
                  </div>
                  <div className="flex w-full h-2 rounded overflow-hidden">
                    <div className="flex-1 bg-[#da0000]"></div>
                    <div className="flex-1 bg-[#fb9003]"></div>
                    <div className="flex-1 bg-[#ffcc00]"></div>
                    <div className="flex-1 bg-[#fef0b7]"></div>
                    <div className="flex-1 bg-[#0b8e05]"></div>
                    <div className="flex-1 bg-[#a3d4ff]"></div>
                    <div className="flex-1 bg-[#4fa7ff]"></div>
                    <div className="flex-1 bg-[#1268db]"></div>
                    <div className="flex-1 bg-[#082970]"></div>
                  </div>
                  <div className="flex w-full mt-0.5 text-[6px] font-bold text-slate-800 text-center tracking-tighter">
                    <div className="flex-1">Extr.</div>
                    <div className="flex-1">Sev.</div>
                    <div className="flex-1 leading-[6px]">Mod.</div>
                    <div className="flex-1">Leve</div>
                    <div className="flex-1">Norm.</div>
                    <div className="flex-1">Leve</div>
                    <div className="flex-1 leading-[6px]">Mod.</div>
                    <div className="flex-1">Sev.</div>
                    <div className="flex-1">Extr.</div>
                  </div>
                </div>
                
                {/* Trend Icons */}
                <div className="flex justify-between items-center px-1">
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="w-5 h-5 bg-slate-600 rounded flex items-center justify-center text-white shadow-sm">
                      <TrendingDown className="w-3 h-3" />
                    </div>
                    <span className="text-[8px] font-bold text-black">Descendo</span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="w-5 h-5 bg-slate-600 rounded flex items-center justify-center text-white shadow-sm">
                      <Equal className="w-3 h-3" />
                    </div>
                    <span className="text-[8px] font-bold text-black">Estável</span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="w-5 h-5 bg-slate-600 rounded flex items-center justify-center text-white shadow-sm">
                      <TrendingUp className="w-3 h-3" />
                    </div>
                    <span className="text-[8px] font-bold text-black">Subindo</span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="w-5 h-5 bg-slate-300 rounded flex items-center justify-center text-white shadow-sm">
                      <HelpCircle className="w-3 h-3" />
                    </div>
                    <span className="text-[8px] font-normal text-slate-600">S/ dados</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'comparativos' && (
          <div className="w-full bg-white h-full flex flex-col shadow-[4px_0_15px_-3px_rgba(0,0,0,0.1)] z-10">
            <div className="p-6 pb-2 border-b border-slate-200 flex flex-col gap-4">
              <h2 className="text-lg font-bold text-slate-800 tracking-tight">Comparativos</h2>
              
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button 
                  onClick={() => setComparativoMode('elnino')}
                  className={`flex-1 text-xs font-bold py-2 rounded-md transition-colors ${comparativoMode === 'elnino' ? 'bg-white text-[#008744] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  El Niño
                </button>
                <button 
                  onClick={() => setComparativoMode('secas')}
                  className={`flex-1 text-xs font-bold py-2 rounded-md transition-colors ${comparativoMode === 'secas' ? 'bg-white text-[#008744] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Secas
                </button>
              </div>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto">
              {comparativoMode === 'elnino' && (
                <>
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Opções do Comparativo El Niño</h2>
                  
                  <label className="text-sm font-semibold text-slate-600 mb-1 block">Selecione a Estação</label>
              <select 
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm mb-4 outline-none focus:border-blue-500 shadow-sm"
                value={elninoStationId}
                onChange={(e) => setElninoStationId(Number(e.target.value))}
              >
                <option value="">-- Escolha --</option>
                {uniqueEstacoes.map(e => <option key={e.codigo} value={e.codigo}>{e.nome} ({e.codigo})</option>)}
              </select>

              <label className="text-sm font-semibold text-slate-600 mb-2 block">Eventos El Niño</label>
              <div className="flex flex-col gap-1 mb-4 max-h-48 overflow-y-auto">
                 {Object.keys(elninoEvents).map(ev => (
                    <label key={ev} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer p-1 hover:bg-slate-50 rounded">
                       <input 
                         type="checkbox" 
                         checked={elninoEvents[ev]}
                         onChange={(e) => setElninoEvents({...elninoEvents, [ev]: e.target.checked})}
                         className="w-3 h-3 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                       />
                       {ev}
                    </label>
                 ))}
              </div>
              
              <button
                onClick={handlePlotElnino}
                disabled={!elninoStationId || !Object.values(elninoEvents).some(v => v) || isElninoLoading}
                className={`w-full py-2 px-4 rounded font-bold text-white shadow-md transition-colors ${(!elninoStationId || !Object.values(elninoEvents).some(v => v) || isElninoLoading) ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#008744] hover:bg-[#007033]'}`}
              >
                {isElninoLoading ? `Carregando... ${elninoProgress}%` : 'Plotar Gráfico'}
              </button>
              </>
              )}

              {comparativoMode === 'secas' && (
                <>
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Comparativo de Secas</h2>
                  
                  <label className="text-sm font-semibold text-slate-600 mb-1 block">Estações de Referência</label>
                  <select 
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm mb-4 outline-none focus:border-blue-500 shadow-sm"
                    value={secasStationId}
                    onChange={(e) => setSecasStationId(Number(e.target.value))}
                  >
                    <option value="">-- Escolha --</option>
                    <option value={17050001}>Óbidos (17050001)</option>
                    <option value={17900000}>Santarém (17900000)</option>
                    <option value={17730000}>Itaituba (17730000)</option>
                    <option value={29050000}>Marabá (29050000)</option>
                    <option value={19152500}>Laranjal do Jari (19152500)</option>
                  </select>

                  <label className="text-sm font-semibold text-slate-600 mb-2 block">Anos Analisados</label>
                  <div className="flex flex-col gap-1 mb-4">
                     {SECAS_YEARS.map(year => (
                        <label key={year} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer p-1 hover:bg-slate-50 rounded">
                           <input 
                             type="checkbox" 
                             checked={secasYearsSelected.includes(year)} 
                             onChange={(e) => {
                               if (e.target.checked) {
                                 setSecasYearsSelected([...secasYearsSelected, year].sort().reverse());
                               } else {
                                 setSecasYearsSelected(secasYearsSelected.filter(y => y !== year));
                               }
                             }}
                             className="w-3 h-3 text-blue-600 rounded border-slate-300" 
                           />
                           {year}
                        </label>
                     ))}
                  </div>
                  
                  <button
                    onClick={handlePlotSecas}
                    disabled={!secasStationId || isSecasLoading}
                    className={`w-full py-2 px-4 rounded font-bold text-white shadow-md transition-colors ${(!secasStationId || isSecasLoading) ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#008744] hover:bg-[#007033]'}`}
                  >
                    {isSecasLoading ? `Carregando... ${secasProgress}%` : 'Plotar Gráfico de Secas'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        
        {activeTab === 'boletins' && (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 px-2">Relatórios</h2>
            <p className="text-sm text-slate-600 px-2 mb-4">
              Gere os boletins diários selecionando uma estação. Os dados refletem o histórico dos últimos 15 dias.
            </p>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4">
              <label className="block text-xs font-bold text-slate-600 mb-2">Selecione a Estação</label>
              <select 
                value={selectedStationId} 
                onChange={(e) => setSelectedStationId(Number(e.target.value))}
                className="w-full bg-white text-slate-800 border border-slate-300 rounded-lg p-2.5 text-sm font-medium outline-none cursor-pointer"
              >
                <option value="">Selecione...</option>
                {uniqueEstacoes.map(est => (
                  <option key={est.codigo} value={est.codigo}>{est.nome} ({est.codigo})</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {activeTab === 'prognostico' && (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col">
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
              value={progStationId}
              onChange={(e) => setProgStationId(Number(e.target.value))}
            >
              <option value="">-- Escolha --</option>
              {uniqueEstacoes.map(e => <option key={e.codigo} value={e.codigo}>{e.nome} ({e.codigo})</option>)}
            </select>
            
            <button 
              id="btn-gerar-prog"
              onClick={handleGeneratePrognostico}
              disabled={!progStationId || isProgLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 rounded-lg font-bold flex justify-center items-center gap-2 transition-colors shadow-lg"
            >
              {isProgLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LineChartIcon className="w-5 h-5" />}
              {isProgLoading ? `Processando... ${progProgress}%` : 'Gerar Prognóstico'}
            </button>
            
            <div className="mt-4 p-3 bg-blue-50 border border-blue-100 text-blue-800 text-xs rounded-lg text-justify leading-relaxed">
              <strong>Processamento em tempo real:</strong> Esse painel baixa milhares de registros históricos da estação e gera estatísticas matemáticas para desenhar o padrão da bacia. Em seguida, injeta os dados reais do ano corrente (observado) e de modelos (previsão) sobre as bandas de anomalia. Pode levar alguns segundos.
            </div>
          </div>
        )}
        
        {/* Botão de download na barra lateral */}
        {activeTab === 'boletins' && selectedStationId && (
          <div className="p-4 mt-auto">
            <button 
              onClick={openDownloadModal}
              className="w-full bg-[#1e293b] hover:bg-[#334155] text-white py-3 px-4 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors shadow-lg"
            >
              <Download size={18} />
              Salvar Histórico
            </button>
          </div>
        )}
        

        
        {activeTab === 'resumo' && (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 px-2">Relatório Com4ºDN</h2>
            <p className="text-sm text-slate-600 px-2 mb-4">
              Acompanhamento diário dos níveis e anomalias dos principais rios da área de atuação do Com4ºDN.
            </p>
            <div className="mt-4 p-3 bg-green-50 border border-green-100 text-green-800 text-xs rounded-lg leading-relaxed">
              <strong>Automático:</strong> As cores e valores da tabela são atualizados em tempo real conforme as leituras da ANA.
            </div>
          </div>
        )}
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
        <AnimatePresence mode="wait">
        
        {/* COMPARATIVOS OVERLAY */}
        {activeTab === 'comparativos' && comparativoMode === 'elnino' && (isElninoLoading || elninoData.length > 0) && (
          <motion.div 
            key="comparativos"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-white z-[500] flex flex-col rounded-lg shadow-xl m-4 overflow-hidden border border-slate-200"
          >
            <div className="bg-[#008744] text-white p-4 flex justify-between items-center shadow-md">
              <div>
                <h2 className="font-bold text-lg flex items-center gap-2">
                  <Layers className="w-5 h-5" /> Comparativo El Niño
                </h2>
                <p className="text-blue-100 text-sm">
                  Estação: {[...estacoes].find(e => String(e.codigo) === String(elninoStationId))?.nome || ''} ({elninoStationId})
                </p>
              </div>
              <button 
                onClick={() => setElninoData([])}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
                title="Fechar gráfico"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 p-4 bg-slate-50 min-h-0 relative">
              {isElninoLoading ? (
                 <div className="w-full h-full flex flex-col justify-center items-center relative">
                    <div className="w-full h-full bg-slate-200/50 animate-pulse rounded-lg border border-slate-300"></div>
                    <div className="absolute font-bold text-slate-500 flex flex-col items-center gap-2">
                       <Loader2 className="w-8 h-8 animate-spin text-[#008744]" />
                       Buscando dados da ANA... {elninoProgress}%
                    </div>
                 </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={elninoData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis 
                    dataKey="label" 
                    tick={{fill: '#64748b', fontSize: 12}}
                    tickMargin={10}
                  />
                  <YAxis 
                    tick={{fill: '#64748b', fontSize: 12}}
                    domain={['auto', 'auto']}
                    tickFormatter={(val) => `${val} cm`}
                  />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any, name: string, props: any) => {
                       let yearText = '';
                       const row = props.payload;
                       if (name === 'Média Histórica') {
                          yearText = 'Média';
                       } else if (name === 'Ano Corrente') {
                          yearText = String(elninoBaseYear + row.yearOffset);
                       } else {
                          // Extract base year from the event string (e.g. OUT2018-JUL2019 -> 2018)
                          const y1 = parseInt(name.substring(3, 7));
                          yearText = String(y1 + row.yearOffset);
                       }
                       return [`${Number(value).toFixed(0)} cm (${yearText})`, name];
                    }}
                    labelFormatter={(label) => `Mês: ${label}`}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  
                  {/* Linha da média histórica */}
                  <Line 
                    type="monotone" 
                    dataKey="Média Histórica" 
                    name="Média Histórica" 
                    stroke="#94a3b8" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    activeDot={{ r: 6 }}
                  />
                  
                  {/* Linhas para cada evento El Nino selecionado */}
                  {Object.keys(elninoEvents).filter(ev => elninoEvents[ev]).map((ev, i) => {
                     // Definir cores para os diferentes eventos
                     const colors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef'];
                     const color = colors[i % colors.length];
                     
                     return (
                       <Line 
                         key={ev}
                         type="monotone" 
                         dataKey={ev} 
                         name={ev} 
                         stroke={color} 
                         strokeWidth={3}
                         dot={{ r: 4, strokeWidth: 2 }}
                         activeDot={{ r: 8, strokeWidth: 0 }}
                       />
                     );
                  })}
                  <Line type="monotone" dataKey="Ano Corrente" stroke="#0f172a" strokeWidth={4} dot={{ r: 4 }} activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
              )}
            </div>
          </motion.div>
        )}

        {/* COMPARATIVO SECAS OVERLAY */}
        {activeTab === 'comparativos' && comparativoMode === 'secas' && (isSecasLoading || secasData.length > 0) && (
          <motion.div 
            key="comparativos-secas"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-white z-[500] flex flex-col rounded-lg shadow-xl m-4 overflow-hidden border border-slate-200"
          >
            <div className="bg-[#b91c1c] text-white p-4 flex justify-between items-center shadow-md">
              <div>
                <h2 className="font-bold text-lg flex items-center gap-2">
                  <Layers className="w-5 h-5" /> Comparativo de Secas
                </h2>
                <p className="text-red-100 text-sm">
                  Estação: {[...estacoes].find(e => String(e.codigo) === String(secasStationId))?.nome || ''} ({secasStationId})
                </p>
              </div>
              <button 
                onClick={() => setSecasData([])}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
                title="Fechar gráfico"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 p-4 bg-slate-50 min-h-0 relative">
              {isSecasLoading ? (
                 <div className="w-full h-full flex flex-col justify-center items-center relative">
                    <div className="w-full h-full bg-slate-200/50 animate-pulse rounded-lg border border-slate-300"></div>
                    <div className="absolute font-bold text-slate-500 flex flex-col items-center gap-2">
                       <Loader2 className="w-8 h-8 animate-spin text-[#b91c1c]" />
                       Buscando dados da ANA... {secasProgress}%
                    </div>
                 </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={secasData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis 
                    dataKey="month" 
                    tick={{fill: '#64748b', fontSize: 12}}
                    tickMargin={10}
                  />
                  <YAxis 
                    tick={{fill: '#64748b', fontSize: 12}}
                    domain={['auto', 'auto']}
                    tickFormatter={(val) => `${val} cm`}
                  />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any, name: string) => {
                       return [`${Number(value).toFixed(0)} cm`, name];
                    }}
                    labelFormatter={(label) => `Mês: ${label}`}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  
                  {/* Highlight Period for Drought (Sep, Oct, Nov) */}
                  <ReferenceArea x1="Set" x2="Nov" strokeOpacity={0.3} fill="#fecaca" fillOpacity={0.3} />

                  <Line type="monotone" dataKey="Média Histórica" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={{ r: 6 }} />
                  
                  {secasYearsSelected.map((year, i) => {
                     const colors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#06b6d4', '#3b82f6'];
                     const color = colors[i % colors.length];
                     return (
                       <Line 
                         key={year}
                         type="monotone" 
                         dataKey={year.toString()} 
                         name={year.toString()} 
                         stroke={color} 
                         strokeWidth={3}
                         dot={{ r: 4, strokeWidth: 2 }}
                         activeDot={{ r: 8, strokeWidth: 0 }}
                       />
                     );
                  })}
                  <Line type="monotone" dataKey="Ano Corrente" name={`Ano Corrente (${secasCurrentY})`} stroke="#0f172a" strokeWidth={4} dot={{ r: 4 }} activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
              )}
            </div>
          </motion.div>
        )}

        {/* PROGNÓSTICO OVERLAY */}
        {activeTab === 'prognostico' && (isProgLoading || progData.length > 0) && (
          <motion.div 
            key="prognostico"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-[400] bg-white p-8 flex flex-col shadow-inner overflow-y-auto"
          >
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Previsão {progDataType === 'cota' ? 'hidrológica' : 'pluviométrica'} para os próximos meses na estação: {[...estacoes].reverse().find(e => String(e.codigo) === String(progStationId))?.nome} ({progStationId})</h2>
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
            )}
            
            <div className="flex-1 w-full min-h-[500px]">
              {isProgLoading ? (
                 <div className="w-full h-full flex flex-col justify-center items-center relative">
                    <div className="w-full h-full bg-slate-200/50 animate-pulse rounded-lg border border-slate-300"></div>
                    <div className="absolute font-bold text-slate-500 flex flex-col items-center gap-2">
                       <Loader2 className="w-8 h-8 animate-spin text-[#008744]" />
                       Processando anomalias... {progProgress}%
                    </div>
                 </div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                {progDataType === 'chuva_bacia' ? (
                  <BarChart data={progData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="data" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} dy={10} />
                    <YAxis tick={{ fontSize: 13, fill: '#64748b' }} axisLine={false} tickLine={false} label={{ value: 'Precipitação (mm)', angle: -90, position: 'insideLeft', offset: -10, fill: '#64748b', fontWeight: 'bold' }} />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                      labelStyle={{ fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}
                      formatter={(value: any) => [`${Number(value).toFixed(1)} mm`, 'Precipitação']}
                      labelFormatter={(label) => `Data: ${label}`}
                    />
                    <Bar dataKey="chuva" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Precipitação" />
                  </BarChart>
                ) : (
                  <ComposedChart data={progData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="mes" tick={{ fontSize: 13, fill: '#64748b', fontWeight: 600 }} axisLine={false} tickLine={false} dy={15} />
                    <YAxis 
                      domain={['dataMin', 'dataMax']} 
                      tick={{ fontSize: 13, fill: '#64748b' }} 
                      axisLine={false} 
                      tickLine={false} 
                      label={{ value: progDataType === 'cota' ? 'Cota (cm)' : 'Precipitação (mm)', angle: -90, position: 'insideLeft', offset: -10, fill: '#64748b', fontWeight: 'bold' }} 
                    />
                    <RechartsTooltip 
                      trigger="click"
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          const unit = progDataType === 'cota' ? 'cm' : 'mm';
                          const textOutline = "1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0px 2px 2px rgba(0,0,0,0.5)";
                          return (
                            <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-200" style={{ minWidth: '220px' }}>
                              <p className="font-bold text-slate-800 mb-2 border-b pb-1">{label}</p>
                              <div className="flex flex-col gap-1 text-[13px] font-semibold">
                                <span style={{ color: '#ffb3b3', textShadow: textOutline }}>Anomalia neg. extrema (até {data.lim_negExtrema} {unit})</span>
                                <span style={{ color: '#ffcccc', textShadow: textOutline }}>Anomalia neg. severa ({data.lim_negExtrema} a {data.lim_negSevera} {unit})</span>
                                <span style={{ color: '#ffe0e0', textShadow: textOutline }}>Anomalia neg. moderada ({data.lim_negSevera} a {data.lim_negModerada} {unit})</span>
                                <span style={{ color: '#fff0f0', textShadow: textOutline }}>Anomalia neg. leve ({data.lim_negModerada} a {data.lim_negLeve} {unit})</span>
                                <span style={{ color: '#e2e8f0', textShadow: textOutline }}>Normalidade ({data.lim_negLeve} a {data.lim_normal} {unit})</span>
                                <span style={{ color: '#f2f9ff', textShadow: textOutline }}>Anomalia pos. leve ({data.lim_normal} a {data.lim_posLeve} {unit})</span>
                                <span style={{ color: '#e6f2ff', textShadow: textOutline }}>Anomalia pos. moderada ({data.lim_posLeve} a {data.lim_posModerada} {unit})</span>
                                <span style={{ color: '#cce6ff', textShadow: textOutline }}>Anomalia pos. severa ({data.lim_posModerada} a {data.lim_posSevera} {unit})</span>
                                <span style={{ color: '#a8d4ff', textShadow: textOutline }}>Anomalia pos. extrema (acima de {data.lim_posSevera} {unit})</span>
                                
                                <span className="mt-1 text-slate-600">Média Histórica: {data.media} {unit}</span>
                                {data.observado !== null && <span className="mt-1 font-bold" style={{ color: '#dc2626' }}>Observado (Real): {data.observado} {unit}</span>}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend 
                      wrapperStyle={{ paddingTop: '20px' }}
                      formatter={(value) => {
                        return <span style={{ color: '#334155', fontWeight: '500', fontSize: '13px' }}>{value}</span>;
                      }}
                    />
                    
                    {/* Absolute Range Areas for Anomalies */}
                    <Area type="monotone" dataKey="negExtrema" legendType="plainline" stroke="#ff9999" strokeWidth={1} fill="#ffb3b3" fillOpacity={0.4} name="Anomalia negativa extrema" activeDot={false} />
                    <Area type="monotone" dataKey="negSevera" legendType="plainline" stroke="#ffb3b3" strokeWidth={1} fill="#ffcccc" fillOpacity={0.4} name="Anomalia negativa severa" activeDot={false} />
                    <Area type="monotone" dataKey="negModerada" legendType="plainline" stroke="#ffcccc" strokeWidth={1} fill="#ffe0e0" fillOpacity={0.4} name="Anomalia negativa moderada" activeDot={false} />
                    <Area type="monotone" dataKey="negLeve" legendType="plainline" stroke="#ffe0e0" strokeWidth={1} fill="#fff0f0" fillOpacity={0.4} name="Anomalia negativa leve" activeDot={false} />
                    
                    <Area type="monotone" dataKey="normal" legendType="plainline" stroke="#e5e7eb" strokeWidth={1} fill="#f3f4f6" fillOpacity={0.5} name="Normalidade" activeDot={false} />
                    
                    <Area type="monotone" dataKey="posLeve" legendType="plainline" stroke="#e6f2ff" strokeWidth={1} fill="#f2f9ff" fillOpacity={0.4} name="Anomalia positiva leve" activeDot={false} />
                    <Area type="monotone" dataKey="posModerada" legendType="plainline" stroke="#cce6ff" strokeWidth={1} fill="#e6f2ff" fillOpacity={0.4} name="Anomalia positiva moderada" activeDot={false} />
                    <Area type="monotone" dataKey="posSevera" legendType="plainline" stroke="#a8d4ff" strokeWidth={1} fill="#cce6ff" fillOpacity={0.4} name="Anomalia positiva severa" activeDot={false} />
                    <Area type="monotone" dataKey="posExtrema" legendType="plainline" stroke="#80bfff" strokeWidth={1} fill="#a8d4ff" fillOpacity={0.4} name="Anomalia positiva extrema" activeDot={false} />

                    
                    {/* Lines drawn last so they appear ON TOP of scatters */}
                    <Line type="monotone" dataKey="media" stroke="#475569" strokeWidth={2} strokeDasharray="6 6" name="Média Histórica" dot={false} activeDot={false} legendType="plainline" connectNulls={true} />
                    <Line type="monotone" dataKey="observado" stroke="#dc2626" strokeWidth={3} name="Observado (Real)" dot={{ r: 5, fill: '#dc2626', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 7, fill: '#dc2626', stroke: '#fff', strokeWidth: 2 }} legendType="circle" connectNulls={true} />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'boletins' && (
          <motion.div 
            key="boletins"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="p-4 w-full h-full relative"
          >
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 min-h-full">
              {selectedStationId ? (
                <>
                  <div className="flex justify-between items-start mb-8 border-b border-slate-100 pb-6">
                    <div>
                      <h2 className="text-xl font-light text-slate-600">Níveis do rio nos últimos 15 dias na estação:</h2>
                      <h1 className="text-3xl font-bold text-slate-800 mt-1">
                        {[...estacoes].reverse().find(e => String(e.codigo) === String(selectedStationId))?.nome} ({selectedStationId})
                      </h1>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={historicalData} margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} dy={10} />
                          <YAxis yAxisId="left" domain={['auto', 'auto']} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} label={{ value: 'Cota (cm)', angle: -90, position: 'insideLeft', offset: -10, fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} />
                          {hasVazao && (
                            <YAxis yAxisId="right" orientation="right" domain={['auto', 'auto']} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} label={{ value: 'Vazão (m³/s)', angle: 90, position: 'insideRight', offset: -10, fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} />
                          )}
                          <RechartsTooltip 
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            labelStyle={{ fontWeight: 'bold', color: '#334155' }}
                          />
                          <Line yAxisId="left" name="Cota (cm)" type="monotone" dataKey="cota" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                          {hasVazao && (
                            <Line yAxisId="right" name="Vazão (m³/s)" type="monotone" dataKey="vazao" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={historicalData} margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <ReferenceLine y={0} stroke="#cbd5e1" />
                          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} label={{ value: 'Variação (cm)', angle: -90, position: 'insideLeft', offset: -10, fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} />
                          <RechartsTooltip 
                            cursor={{fill: '#f1f5f9'}} 
                            formatter={(value: any) => [`${value} cm`, 'Variação']}
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            labelStyle={{ fontWeight: 'bold', color: '#334155' }}
                          />
                          <Bar dataKey="variacao" name="Variação (cm)" radius={[2, 2, 0, 0]}>
                            {historicalData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.variacao >= 0 ? '#3b82f6' : '#f87171'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400">
                  Selecione uma estação no menu lateral para gerar o boletim.
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* RESUMO COM4DN DASHBOARD */}
        {activeTab === 'resumo' && (
          <motion.div 
            key="resumo"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="p-2 max-w-4xl mx-auto flex flex-col justify-center min-h-full"
          >
            <div className="bg-white shadow-md border border-slate-200">
              <h2 className="text-lg font-serif font-bold text-center text-[#1e5d36] mb-0 py-2 bg-[#e5f5e0]">
                Resumo de Níveis Com4ºDN - {new Date().toLocaleString('pt-BR', { month: 'short', year: 'numeric' }).toUpperCase().replace('. DE ', '').replace(' DE ', '')}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-[#1e5d36]">
                  <thead>
                    <tr className="bg-[#1e5d36] text-white">
                      <th className="border border-white p-1 text-sm font-serif">Rios</th>
                      <th className="border border-white p-1 text-sm font-serif">Estação</th>
                      <th className="border border-white p-1 text-xs font-serif leading-tight">
                        Nível do Rio (m)<br/>
                        <span className="text-[10px] font-normal">MIN &lt; MÉDIA &lt; MÁX ({new Date().toLocaleString('pt-BR', { month: 'short' }).toUpperCase().replace('.', '')})</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {GRUPOS_RIOS.map((grupo, gIdx) => {
                      return grupo.estacoes.map((estInfo, eIdx) => {
                        const nomeEstacao = typeof estInfo === 'string' ? estInfo : estInfo.nome;
                        const idEstacao = typeof estInfo === 'string' ? null : estInfo.id;
                        
                        let est = null;
                        if (idEstacao) {
                          est = [...estacoes].reverse().find(e => String(e.codigo) === String(idEstacao));
                        }
                        if (!est) {
                          const normalizeStr = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                          const normalizedNome = normalizeStr(nomeEstacao);
                          est = [...estacoes].reverse().find(e => normalizeStr(e.nome) === normalizedNome && e.cotaUltimaMedicao != null) || 
                                [...estacoes].reverse().find(e => normalizeStr(e.nome).includes(normalizedNome) && e.cotaUltimaMedicao != null);
                        }
                        
                        let nivelM = '---';
                        let minM = '---';
                        let medM = '---';
                        let maxM = '---';
                        let anomaliaTexto = 'Sem dados';
                        let corFundo = 'bg-white';
                        let corTexto = 'text-[#1e5d36]';
                        
                        if (est) {
                          const nivelAtual = est.cotaUltimaMedicao ?? 0;
                          const rawMin = est.cotaRegua?.cotaMinima ?? est.minima_historica_mes ?? est.minima_mes ?? est.cotaMinimaMes ?? est.cotaUltimaMedicao;
                          const rawMax = est.cotaRegua?.cotaMaxima ?? est.maxima_historica_mes ?? est.maxima_mes ?? est.cotaMaximaMes ?? est.cotaUltimaMedicao;
                          const rawMed = est.cotaRegua?.cotaMedia ?? est.media_historica_mes ?? est.media_mes ?? est.cotaMediaMes ?? est.cotaUltimaMedicao;
                          
                          nivelM = (nivelAtual / 100).toFixed(2).replace('.', ',');
                          minM = ((rawMin || 0) / 100).toFixed(2).replace('.', ',');
                          medM = ((rawMed || 0) / 100).toFixed(2).replace('.', ',');
                          maxM = ((rawMax || 0) / 100).toFixed(2).replace('.', ',');
                          
                          switch(est.anomalia) {
                            case 'ANOMALIA_NEGATIVA_EXTREMA': anomaliaTexto = 'Anomalia Extrema Negativa'; corFundo = 'bg-[#f4cccc]'; corTexto = 'text-[#cc0000]'; break;
                            case 'ANOMALIA_NEGATIVA_SEVERA': anomaliaTexto = 'Anomalia Severa Negativa'; corFundo = 'bg-[#fce5cd]'; corTexto = 'text-[#e69138]'; break;
                            case 'ANOMALIA_NEGATIVA_MODERADA': anomaliaTexto = 'Anomalia Moderada Negativa'; corFundo = 'bg-[#fff2cc]'; corTexto = 'text-[#f1c232]'; break;
                            case 'ANOMALIA_NEGATIVA_LEVE': anomaliaTexto = 'Anomalia Leve Negativa'; corFundo = 'bg-[#e8f4d9]'; corTexto = 'text-[#8fce00]'; break;
                            case 'NORMAL': anomaliaTexto = 'Sem anomalia'; corFundo = 'bg-[#e5f5e0]'; corTexto = 'text-[#1e5d36]'; break;
                            case 'ANOMALIA_POSITIVA_LEVE': anomaliaTexto = 'Anomalia Leve Positiva'; corFundo = 'bg-[#d9eaed]'; corTexto = 'text-[#45818e]'; break;
                            case 'ANOMALIA_POSITIVA_MODERADA': anomaliaTexto = 'Anomalia Moderada Positiva'; corFundo = 'bg-[#b4c6e7]'; corTexto = 'text-[#1e5d36]'; break;
                            case 'ANOMALIA_POSITIVA_SEVERA': anomaliaTexto = 'Anomalia Severa Positiva'; corFundo = 'bg-[#cfe2f3]'; corTexto = 'text-[#1155cc]'; break;
                            case 'ANOMALIA_POSITIVA_EXTREMA': anomaliaTexto = 'Anomalia Extrema Positiva'; corFundo = 'bg-[#d0e0e3]'; corTexto = 'text-[#0b5394]'; break;
                          }
                        }
                        
                        return (
                          <tr key={`${grupo.nome}-${nomeEstacao}`}>
                            {eIdx === 0 && (
                              <td rowSpan={grupo.estacoes.length} className="border border-slate-300 p-1 text-center text-sm text-slate-800 bg-white">
                                {grupo.nome}
                              </td>
                            )}
                            <td className={`border border-slate-300 p-1 text-center ${corFundo}`}>
                              <div className={`font-bold text-sm ${corTexto}`}>
                                {est?.nome || nomeEstacao} 
                                <span className="text-[9px] text-gray-500 font-normal ml-1">[{est?.codigo || 's/ ID'}]</span>
                              </div>
                              <div className={`text-[10px] ${corTexto} font-medium`}>({anomaliaTexto})</div>
                            </td>
                            <td className="border border-slate-300 p-1 text-center bg-white">
                              <div className="text-xl font-bold text-[#1e5d36] mb-0">{nivelM}</div>
                              <div className="text-[10px] text-slate-600 font-medium">{minM} &lt; {medM} &lt; {maxM}</div>
                            </td>
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-0 py-3 bg-white text-center text-sm font-bold text-black border-t border-slate-300">
                Dados observados em {new Date().toLocaleString('pt-BR', { day: '2-digit', month: 'short' }).toUpperCase().replace('.', '')}
              </div>
              <div className="mt-0 p-3 text-[11px] text-black text-justify border-t border-slate-300 bg-white font-serif">
                * Anomalias positivas indicam níveis do rio acima do padrão de referência, enquanto anomalias negativas indicam níveis abaixo desse padrão.
              </div>
            </div>
          </motion.div>
        )}

        {/* MAP VIEW */}
        </AnimatePresence>
        
        <div style={{ display: activeTab === 'produtos' ? 'block' : 'none', height: '100%', width: '100%', position: 'relative' }}>
          
          {/* Chuva Mosaico Control Panel */}
          {activeProduct === 'chuva' && (
            <div className="absolute top-4 left-4 z-[1000] w-[300px] bg-white/95 backdrop-blur-sm shadow-xl rounded-xl border border-slate-200 overflow-hidden flex flex-col pointer-events-auto transition-all">
              <div className="bg-[#4a8559] px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-white">
                  <CloudRain className="w-5 h-5" />
                  <span className="font-semibold text-sm">Chuva em Bacia Hidrográfica</span>
                </div>
                <div className="w-8 h-4 bg-green-300 rounded-full relative cursor-pointer">
                  <div className="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full"></div>
                </div>
              </div>
              
              <div className="p-4 flex flex-col gap-5">
                {/* Legenda */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-700 mb-2">Legenda</h4>
                  <div className="text-[10px] text-slate-500 text-center mb-1">Precipitação acumulada (24h)</div>
                  <div className="h-3 w-full bg-gradient-to-r from-yellow-100 via-blue-400 to-purple-900 rounded-sm"></div>
                  <div className="flex justify-between text-[9px] text-slate-500 mt-1 px-1">
                    <span>1</span>
                    <span>10</span>
                    <span>30</span>
                    <span>60</span>
                    <span>100</span>
                    <span>150</span>
                  </div>
                </div>

                {/* Controles */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-700 mb-3 border-b border-slate-100 pb-1">Controles</h4>
                  
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="text-[11px] text-slate-500 mb-1 block">Data</label>
                      <div className="relative">
                        <input 
                          type="date" 
                          value={chuvaDate}
                          onChange={(e) => setChuvaDate(e.target.value)}
                          className="w-full bg-slate-900 text-white text-xs px-3 py-2 rounded-md appearance-none"
                        />
                        <Calendar className="absolute right-2 top-2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-[11px] text-slate-500 mb-1 block">Estimador</label>
                      <select 
                        value={estimador}
                        onChange={(e) => setEstimador(e.target.value)}
                        className="w-full bg-slate-900 text-white text-xs px-3 py-2 rounded-md outline-none"
                      >
                        <option value="NOAA">NOAA</option>
                        <option value="INPE">INPE</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="text-[11px] text-slate-500 mb-1 block">Visualização</label>
                      <select 
                        value={chuvaViewType}
                        onChange={(e) => setChuvaViewType(e.target.value)}
                        className="w-full bg-slate-900 text-white text-xs px-3 py-2 rounded-md outline-none"
                      >
                        <option value="GRADE">GRADE</option>
                        <option value="POLÍGONOS">POLÍGONOS</option>
                      </select>
                    </div>
                    
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[11px] text-slate-500 flex items-center gap-1">Opacidade <Info className="w-3 h-3"/></label>
                        <span className="text-[11px] text-slate-500">{chuvaOpacity}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" max="100" 
                        value={chuvaOpacity} 
                        onChange={(e) => setChuvaOpacity(parseInt(e.target.value))}
                        className="w-full accent-[#4a8559] h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <MapContainer 
            center={[-3.119, -60.021]} 
            zoom={5} 
            zoomControl={false}
            className="h-full w-full z-10"
          >
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="OpenStreetMap">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Google Satélite">
                <TileLayer
                  url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
                  maxZoom={20}
                  attribution="Google Maps"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Google Híbrido">
                <TileLayer
                  url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                  maxZoom={20}
                  attribution="Google Maps"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Google Ruas">
                <TileLayer
                  url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                  maxZoom={20}
                  attribution="Google Maps"
                />
              </LayersControl.BaseLayer>
            </LayersControl>
            
            <ZoomControl position="bottomright" />

          {/* KMZ Overlay */}
          <KmzOverlay url={kmzFileUrl} />

          {(activeTab === 'produtos' && ['niveis_com4_principais', 'niveis_com4', 'niveis_amazonia'].includes(activeProduct)) && estacoes.filter(estacao => {
              if (activeProduct === 'niveis_amazonia') return true;
              
              if (activeProduct === 'niveis_com4_principais') {
                  const com4_ids = [
                    31645000, 29680090, 29050000, 29070100, 18850000, 18867900, 
                    18950003, 18390000, 19500000, 19152500, 17900000, 17730000, 
                    17050001, 16900000, 18936000
                  ];
                  return com4_ids.includes(Number(estacao.codigo));
              }
              
              if (activeProduct === 'niveis_com4') {
                  const lat = estacao.latitude;
                  const lng = estacao.longitude;
                  
                  // Bounding box filter for PA, AP, MA, PI
                  if (lat < -11.0 || lat > 5.0 || lng < -59.0 || lng > -40.0) return false;
                  
                  return true;
              }
              
              return false;
          }).map(estacao => (
            <Marker 
              key={estacao.codigo} 
              position={[estacao.latitude, estacao.longitude]}
              icon={getMarkerIcon(estacao.anomalia, estacao.statusCota)}
            >
              <Popup className="custom-popup" closeButton={true}>
                <div className="w-[360px] bg-white flex flex-col relative">
                  {/* Close button that looks native but is inside our custom container */}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      const leafletClose = (e.target as any).closest('.leaflet-popup').querySelector('.leaflet-popup-close-button');
                      if (leafletClose) leafletClose.click();
                    }}
                    className="absolute top-2.5 right-2.5 text-slate-600 hover:text-black z-10 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  
                  {/* Header */}
                  <div className={`${estacao.anomalia.includes('POSITIVA') ? 'bg-[#b3d4ff]' : estacao.anomalia.includes('NEGATIVA') ? 'bg-[#feb2b2]' : 'bg-[#9ae6b4]'} px-4 py-3 flex items-center justify-between rounded-t-lg`}>
                    <div className="flex items-center gap-2 text-slate-800">
                      <div 
                        className="w-7 h-7 rounded-md flex items-center justify-center shadow-sm p-1"
                        style={{ backgroundColor: getIconProps(estacao.anomalia, estacao.statusCota).color }}
                        dangerouslySetInnerHTML={{ __html: getIconProps(estacao.anomalia, estacao.statusCota).svg }}
                      />
                      <span className="font-bold text-[15px]">{activeProduct.startsWith('niveis') ? 'Nível do rio' : 'Estação Hidrometeorológica'}</span>
                    </div>
                  </div>
                  
                  <div className="p-4">
                    <div className="text-xs text-slate-600 mb-3 border-b border-slate-100 pb-3">
                      Estação: <span className="text-slate-800 font-medium">{estacao.nome}</span> <span className="text-slate-400">({estacao.codigo})</span>
                    </div>
                    
                    <div className="flex gap-4 items-stretch">
                      {activeProduct.startsWith('niveis') ? (
                        <>
                          {/* Cota */}
                          <div className="flex flex-col justify-center min-w-[80px]">
                            <div className="flex items-center gap-1 text-[#276749] font-bold text-xs mb-1">
                              <Waves className="w-4 h-4" /> Nível do rio
                            </div>
                            <div className="flex items-baseline gap-1 mt-1">
                              <span className="text-[28px] font-black text-slate-800">{(estacao.cotaUltimaMedicao / 100).toFixed(2)}</span>
                              <span className="text-slate-500 font-medium text-sm">m</span>
                            </div>
                          </div>
                          
                          <div className="flex-1 flex gap-3 border-l border-slate-100 pl-4 py-1">
                            {/* Valores com fallback robusto para campos dinâmicos da API Sipam */}
                            {(() => {
                              const minDia = estacao.cotaDataAtual?.minima ?? estacao.cotaMinimaDia ?? estacao.cota_minima_dia ?? estacao.cotaUltimaMedicao;
                              const maxDia = estacao.cotaDataAtual?.maxima ?? estacao.cotaMaximaDia ?? estacao.cota_maxima_dia ?? estacao.cotaUltimaMedicao;
                              const medDia = estacao.cotaDataAtual?.media ?? estacao.cotaMediaDia ?? estacao.cota_media_dia ?? estacao.cotaUltimaMedicao;

                              const minMes = estacao.cotaRegua?.cotaMinima ?? estacao.minima_historica_mes ?? estacao.minima_mes ?? estacao.cotaMinimaMes ?? estacao.cotaUltimaMedicao;
                              const maxMes = estacao.cotaRegua?.cotaMaxima ?? estacao.maxima_historica_mes ?? estacao.maxima_mes ?? estacao.cotaMaximaMes ?? estacao.cotaUltimaMedicao;
                              const medMes = estacao.cotaRegua?.cotaMedia ?? estacao.media_historica_mes ?? estacao.media_mes ?? estacao.cotaMediaMes ?? estacao.cotaUltimaMedicao;

                              return (
                                <>
                                  {/* Histórico do Dia */}
                                  <div className="flex-1">
                                    <div className="flex items-center gap-1 text-[#276749] font-bold text-[10px] mb-2 leading-tight h-6">
                                      <Clock className="w-3 h-3 flex-shrink-0" /> Histórico do<br/>dia (m)
                                    </div>
                                    <div className="flex justify-between text-[10px] mb-1">
                                      <span className="text-slate-500">Mínima</span>
                                      <span className="font-bold text-slate-700">{minDia != null ? (minDia / 100).toFixed(2) : '-'}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px] mb-1">
                                      <span className="text-slate-500">Máxima</span>
                                      <span className="font-bold text-slate-700">{maxDia != null ? (maxDia / 100).toFixed(2) : '-'}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-slate-500">Média</span>
                                      <span className="font-bold text-slate-700">{medDia != null ? (medDia / 100).toFixed(2) : '-'}</span>
                                    </div>
                                  </div>
                                  
                                  {/* Histórico do Mês */}
                                  <div className="flex-1 border-l border-slate-100 pl-3">
                                    <div className="flex items-center gap-1 text-[#276749] font-bold text-[10px] mb-2 leading-tight h-6">
                                      <Calendar className="w-3 h-3 flex-shrink-0" /> Histórico de<br/>AGOSTO (m)
                                    </div>
                                    <div className="flex justify-between text-[10px] mb-1">
                                      <span className="text-slate-500">Mínima</span>
                                      <span className="font-bold text-slate-700">{minMes != null ? (minMes / 100).toFixed(2) : '-'}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px] mb-1">
                                      <span className="text-slate-500">Máxima</span>
                                      <span className="font-bold text-slate-700">{maxMes != null ? (maxMes / 100).toFixed(2) : '-'}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-slate-500">Média</span>
                                      <span className="font-bold text-slate-700">{medMes != null ? (medMes / 100).toFixed(2) : '-'}</span>
                                    </div>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col justify-center items-center w-full py-5 bg-blue-50/70 rounded-xl border border-blue-100 my-1">
                          <CloudRain className="w-7 h-7 text-blue-500 mb-2 opacity-80" />
                          <span className="text-xs font-semibold text-slate-600 text-center px-4 leading-relaxed">
                            Clique em <strong className="text-blue-700">Gráfico</strong> ou <strong className="text-blue-700">Perfil</strong> para gerar a estatística e o histórico pluviométrico desta estação.
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className="text-center text-[10px] text-slate-500 mt-5 mb-3">
                      Data da medição: {new Date(estacao.dataHoraUltimaMedicao).toLocaleString('pt-BR')}h
                    </div>
                    
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          setSelectedStationId(estacao.codigo);
                          setActiveTab('boletins');
                        }}
                        className="flex-1 py-1.5 border border-[#276749] text-[#276749] hover:bg-[#f0fff4] rounded-lg text-xs font-semibold transition-colors"
                      >
                        Gráfico
                      </button>
                      <button 
                        onClick={() => {
                          setProgStationId(estacao.codigo);
                          setActiveTab('prognostico');
                          // Force a tiny delay so the tab mounts before we try to auto-generate
                          setTimeout(() => {
                            const btn = document.getElementById('btn-gerar-prog');
                            if (btn) btn.click();
                          }, 100);
                        }}
                        className="flex-1 py-1.5 border border-[#276749] text-[#276749] hover:bg-[#f0fff4] rounded-lg text-xs font-semibold transition-colors"
                      >
                        Perfil
                      </button>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Render Reservatórios / Hidrelétricas */}
          {activeProduct === 'reservatorios' && hidreletricas.map(uhe => (
            <Marker 
              key={uhe.codigo} 
              position={[uhe.latitude, uhe.longitude]}
              icon={getReservatorioIcon(uhe.tipo)}
            >
              <Popup className="rounded-xl shadow-xl border-0">
                <div className="p-1 min-w-[280px]">
                  <h3 className="font-bold text-lg text-slate-800 mb-1">{uhe.nome}</h3>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold uppercase">{uhe.tipo.trim()}</span>
                  </div>
                  <div className="text-xs text-slate-600 mb-4 flex flex-col gap-1.5">
                    <span className="flex justify-between border-b pb-1"><strong>Nível Montante:</strong> <span>{uhe.nivelMontante} m</span></span>
                    <span className="flex justify-between border-b pb-1"><strong>Volume Útil:</strong> <span className="font-bold text-blue-600">{uhe.volumeUtil}%</span></span>
                    <span className="flex justify-between border-b pb-1"><strong>Vazão Afluente:</strong> <span>{uhe.vazaoAfluente} m³/s</span></span>
                    <span className="flex justify-between pb-1"><strong>Vazão Defluente:</strong> <span>{uhe.vazaoDefluente} m³/s</span></span>
                    <span className="mt-2 text-[10px] text-slate-400">Atualizado em: {new Date(uhe.dataUltimaAtualizacao).toLocaleString('pt-BR')}</span>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
          {/* GeoJSON para Chuva */}
          {activeProduct === 'chuva' && baciasGeoJson && (
            <GeoJSON 
              data={baciasGeoJson} 
              onEachFeature={onBaciaClick}
              style={{
                color: '#475569',
                weight: 1,
                fillColor: 'transparent',
                fillOpacity: 0.1
              }}
            />
          )}
          
          {/* Popup da Sub-bacia */}
          {activeProduct === 'chuva' && selectedBacia && (
            <Popup 
              position={selectedBacia.latlng}
              onClose={() => setSelectedBacia(null)}
              className="custom-popup"
            >
              <div className="w-[360px] bg-white flex flex-col relative">
                {/* Header idêntico ao Sipam */}
                <div className="bg-[#4a8559] px-4 py-3 flex items-center justify-between rounded-t-lg">
                  <div className="flex items-center gap-2 text-white">
                    <CloudRain className="w-5 h-5" />
                    <span className="font-bold text-[15px]">Chuva em Bacia Hidrográfica</span>
                  </div>
                </div>
                
                <div className="space-y-1 mb-3 text-sm px-4 pt-4">
                  <div>Bacia: <span className="font-bold">{selectedBacia.feature.properties.nome_bacia || selectedBacia.feature.properties.nombacia || 'N/A'}</span></div>
                  <div>Código: <span className="font-bold">{selectedBacia.feature.properties.codigo_sub_bacia || selectedBacia.feature.properties.nunivotto || 'N/A'}</span></div>
                  <div>Rio Principal: <span className="font-bold">{selectedBacia.feature.properties.regiao37 || selectedBacia.feature.properties.nomrio || 'N/A'}</span></div>
                  {selectedBacia.feature.properties.nuareacont && <div>Área Sub-bacia (km²): <span className="font-bold">{selectedBacia.feature.properties.nuareacont}</span></div>}
                </div>
                
                <div className="p-4 pt-0">
                  <div className="flex gap-4">
                    <div className="flex flex-col flex-1 justify-center">
                      <div className="flex items-center gap-1 text-[#4a8559] font-bold text-xs mb-1">
                        <Waves className="w-4 h-4" /> Precipitação (mm)
                      </div>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-xl font-bold text-slate-800">{estimador === 'NOAA' ? 'CPC:' : 'INPE:'}</span>
                        <span className="text-[28px] font-black text-slate-800">
                          {baciaChuvaData ? baciaChuvaData.precipitacaoCpc?.toFixed(1) : <Loader2 className="w-6 h-6 animate-spin text-slate-400" />}
                        </span>
                        <span className="text-sm font-semibold text-slate-500">mm</span>
                      </div>
                    </div>
                    
                    <div className="flex-1 flex flex-col border-l border-slate-100 pl-4 py-1">
                      <div className="flex items-center gap-1 text-[#4a8559] font-bold text-[10px] mb-2 leading-tight">
                        <CloudRain className="w-3 h-3 flex-shrink-0" /> Precipitação<br/>Acumulados (mm)
                      </div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-slate-500 font-bold">Acumulado 7 dias:</span>
                        <span className="font-bold text-slate-700 text-xs">{baciaChuvaData ? baciaChuvaData.acumulado_7?.toFixed(1) : '-'}</span>
                      </div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-slate-500 font-bold">Acumulado 15 dias:</span>
                        <span className="font-bold text-slate-700 text-xs">{baciaChuvaData ? baciaChuvaData.acumulado_15?.toFixed(1) : '-'}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500 font-bold">Acumulado 30 dias:</span>
                        <span className="font-bold text-slate-700 text-xs">{baciaChuvaData ? baciaChuvaData.acumulado_30?.toFixed(1) : '-'}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-center text-[10px] text-slate-500 mt-5 mb-3">
                    Data: {chuvaDate.split('-').reverse().join('/')}
                  </div>
                  
                    <button 
                      onClick={() => {
                        if (baciaChuvaData) {
                          setProgStationId(selectedBacia.feature.properties.nunivotto);
                          setProgDataType('chuva_bacia');
                          setProgData(baciaChuvaData.serie);
                          setActiveTab('prognostico');
                        }
                      }}
                    disabled={!baciaChuvaData}
                    className="w-full py-2 border border-[#4a8559] text-[#4a8559] hover:bg-[#f0fff4] rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    Gráfico
                  </button>
                </div>
              </div>
            </Popup>
          )}

        {/* WMS Layers */}
        {(activeProduct === 'chuva' || (activeProduct === 'chuva_bacia' && chuvaViewType === 'GRADE')) && (
          (() => {
            const [ano, mes, dia] = chuvaDate.split('-');
            const viewparams = `dia:${dia};mes:${mes};ano:${ano}`;
            const wmsLayer = estimador === 'NOAA' ? 'sipam:cpc_grade' : 'sipam:merge_grade';
            
            return (
              <WMSTileLayer
                key={`${chuvaDate}-${chuvaViewType}-${estimador}`}
                url={`http://127.0.0.1:8000/api/wms?viewparams=${viewparams}`}
                layers={wmsLayer}
                format="image/png"
                transparent={true}
                crs={L.CRS.EPSG4326}
                zIndex={1000}
                opacity={chuvaOpacity / 100}
              />
            );
          })()
        )}

        </MapContainer>
        </div>        {/* LEGEND WAS MOVED TO THE SIDEBAR */}
      </main>

      {/* Download Modal */}
      <AnimatePresence>
      {isDownloadModalOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm"
        >
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-2xl shadow-xl p-6 w-96 max-w-[90%]"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-800">Baixar Série Histórica</h3>
              <button onClick={() => !isDownloading && setIsDownloadModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">Data Inicial</label>
                <input 
                  type="date" 
                  value={downloadStartDate}
                  onChange={(e) => setDownloadStartDate(e.target.value)}
                  disabled={isDownloading}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">Data Final</label>
                <input 
                  type="date" 
                  value={downloadEndDate}
                  onChange={(e) => setDownloadEndDate(e.target.value)}
                  disabled={isDownloading}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>
              
              {isDownloading && (
                <div className="pt-2">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Baixando dados...</span>
                    <span>{downloadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-blue-600 h-2 transition-all duration-300" style={{ width: `${downloadProgress}%` }}></div>
                  </div>
                </div>
              )}
              
              <button 
                onClick={executeHistoricalDownload}
                disabled={isDownloading}
                className="w-full mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 rounded-lg font-bold flex justify-center items-center gap-2 transition-colors"
              >
                {isDownloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                {isDownloading ? 'Processando...' : 'Iniciar Download'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
