const SHEET_URLS = {
  productivity: process.env.SHEET_URL_PRODUCTIVITY
    || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT6_Ukl-_qTeyobt1Q3SpgXhR0921qgUWrz6WPnINvl3U2OXl1dcsjEyGgMafUmG_cb9rE6QNrWZkuX/pub?gid=948739317&single=true&output=csv',
  'revenue-token': process.env.SHEET_URL_REVENUE_TOKEN
    || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSYw0XpoBrl5gNAHq3n2p-OLAEOHwsBVVQy70ffPRRSk2SloYaqPPZ1X6YcuesaGvzlgf1EDUE8bwJV/pub?gid=0&single=true&output=csv',
  'revenue-full': process.env.SHEET_URL_REVENUE_FULL
    || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSYw0XpoBrl5gNAHq3n2p-OLAEOHwsBVVQy70ffPRRSk2SloYaqPPZ1X6YcuesaGvzlgf1EDUE8bwJV/pub?gid=1494867608&single=true&output=csv',
  'cohort-targets': process.env.SHEET_URL_COHORT_TARGETS
    || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSYw0XpoBrl5gNAHq3n2p-OLAEOHwsBVVQy70ffPRRSk2SloYaqPPZ1X6YcuesaGvzlgf1EDUE8bwJV/pub?gid=846488199&single=true&output=csv',
  'tl-targets': process.env.SHEET_URL_TL_TARGETS
    || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSYw0XpoBrl5gNAHq3n2p-OLAEOHwsBVVQy70ffPRRSk2SloYaqPPZ1X6YcuesaGvzlgf1EDUE8bwJV/pub?gid=209837982&single=true&output=csv',
  'bd-targets': process.env.SHEET_URL_BD_TARGETS
    || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSYw0XpoBrl5gNAHq3n2p-OLAEOHwsBVVQy70ffPRRSk2SloYaqPPZ1X6YcuesaGvzlgf1EDUE8bwJV/pub?gid=68498859&single=true&output=csv',
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

  const sheet = event.queryStringParameters?.sheet;
  const url = sheet && SHEET_URLS[sheet];

  if (!url) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Invalid or missing sheet parameter',
        allowed: Object.keys(SHEET_URLS),
      }),
    };
  }

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'GM-Dashboard-Netlify/1.0' },
    });

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Google Sheets returned HTTP ${resp.status}` }),
      };
    }

    const text = await resp.text();

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
      body: text,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Failed to fetch sheet data' }),
    };
  }
};
