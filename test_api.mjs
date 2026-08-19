import fetch from 'node-fetch';

async function testApi() {
  const IDENTIFICADOR = '01763968294';
  const SENHA = 'cr53pe56';
  const codigoEstacao = 17900000;
  
  try {
    const authRes = await fetch('https://apihidro.sipam.gov.br/api/ana/EstacoesTelemetricas/OAUth/v1', {
      headers: {
        'Identificador': IDENTIFICADOR,
        'Senha': SENHA
      }
    });
    
    const authData = await authRes.json();
    const token = authData.items.tokenautenticacao;
    console.log('Token obtained');
    
    const params = new URLSearchParams({
      'Código da Estação': codigoEstacao.toString(),
      'Tipo Filtro Data': 'DATA_LEITURA',
      'Range Intervalo de busca': 'DIAS_30',
      'Data de Busca (yyyy-MM-dd)': '2024-01-01'
    });
    
    const dataRes = await fetch(`https://apihidro.sipam.gov.br/api/ana/EstacoesTelemetricas/HidroinfoanaSerieTelemetricaAdotada/v1?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await dataRes.json();
    console.log(`Results for 2024-01-01: ${data.items ? data.items.length : 0}`);
    
    if (data.items && data.items.length > 0) {
      console.log('Sample item:', data.items[0]);
    }
  } catch (error) {
    console.error(error);
  }
}

testApi();
