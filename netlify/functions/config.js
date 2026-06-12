const DEFAULT_URLS = {
  leads: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQe0m4OUvApuACPrN8jWN7twZuoGgZA3jj3ZU9Adp1C5LTe_8DZD7rseDmtxoaE7poMn7CMd4nVxyoZ/pub?gid=1770292739&single=true&output=csv',
  productivity: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT6_Ukl-_qTeyobt1Q3SpgXhR0921qgUWrz6WPnINvl3U2OXl1dcsjEyGgMafUmG_cb9rE6QNrWZkuX/pub?gid=948739317&single=true&output=csv',
  revenueToken: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSYw0XpoBrl5gNAHq3n2p-OLAEOHwsBVVQy70ffPRRSk2SloYaqPPZ1X6YcuesaGvzlgf1EDUE8bwJV/pub?gid=0&single=true&output=csv',
  revenueFull: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSYw0XpoBrl5gNAHq3n2p-OLAEOHwsBVVQy70ffPRRSk2SloYaqPPZ1X6YcuesaGvzlgf1EDUE8bwJV/pub?gid=1494867608&single=true&output=csv',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  return {
    statusCode: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
    body: JSON.stringify({
      leads: process.env.SHEET_URL_LEADS || DEFAULT_URLS.leads,
      productivity: process.env.SHEET_URL_PRODUCTIVITY || DEFAULT_URLS.productivity,
      revenueToken: process.env.SHEET_URL_REVENUE_TOKEN || DEFAULT_URLS.revenueToken,
      revenueFull: process.env.SHEET_URL_REVENUE_FULL || DEFAULT_URLS.revenueFull,
    }),
  };
};
