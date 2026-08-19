import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('request', request => {
    const url = request.url();
    if (url.includes('wms') || url.includes('geoserver') || url.includes('wmts') || url.includes('CPTEC') || url.includes('cptec')) {
      console.log('Intercepted WMS/Tiles URL:', url);
    }
  });

  console.log('Navigating to SipamHidro...');
  await page.goto('https://hidro.sipam.gov.br/map', { waitUntil: 'networkidle2', timeout: 60000 });
  
  // Wait a bit to let layers load
  await new Promise(r => setTimeout(r, 10000));
  
  await browser.close();
})();
