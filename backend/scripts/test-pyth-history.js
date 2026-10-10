const now = Math.floor(Date.now() / 1000);
const from = now - (7 * 86400);
const symbols = ['Crypto.ETH/USD', 'Crypto.SOL/USD', 'Crypto.ARB/USD', 'Crypto.BTC/USD'];

async function testAll() {
  for (const sym of symbols) {
    const url = `https://pyth.dourolabs.app/v1/fixed_rate@1000ms/history?symbol=${encodeURIComponent(sym)}&from=${from}&to=${now}&resolution=1D`;
    try {
      const res = await fetch(url, { headers: { 'Authorization': 'Bearer 4mM6CGdUVyhareZiR8MHKUJKAyeH7E8gSamuuDPgKFBE' } });
      const data = await res.json();
      console.log(sym, 'Status:', res.status, 'Points:', data.c ? data.c.length : 0, 'Latest close: $' + (data.c ? data.c[data.c.length-1].toFixed(2) : 'N/A'));
    } catch (e) {
      console.error(sym, e.message);
    }
  }
}

testAll();
