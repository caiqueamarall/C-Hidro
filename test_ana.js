const https = require('https');

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({status: res.statusCode, data}));
    }).on('error', reject);
  });
}

async function test() {
  const authUrl = 'https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/OAUth/v1';
  const authRes = await get(authUrl, { 'Identificador': '01763968294', 'Senha': 'cr53pe56' });
  const token = authRes.data.replace(/"/g, '').trim();
  console.log('Token:', token.substring(0, 10));

  const runTest = async (range) => {
    const url = `https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/HidroinfoanaSerieTelemetricaAdotada/v1?C%C3%B3digo%20da%20Esta%C3%A7%C3%A3o=17900000&Tipo%20Filtro%20Data=DATA_LEITURA&Range%20Intervalo%20de%20busca=${range}`;
    const res = await get(url, { 'Authorization': `Bearer ${token}` });
    try {
      const json = JSON.parse(res.data);
      console.log(`${range}: ${json.items ? json.items.length : 0} items`);
    } catch(e) {
      console.log(`${range} error:`, res.status, res.data.substring(0, 200));
    }
  };

  await runTest('DIAS_30');
  await runTest('DIAS_90');
}
test();
