/**
 * Astra Hyperliquid SDK Connector
 * Integrates Hyperliquid L1 orderbook/mark prices with Astra HyperEVM Protection Engine.
 */

export interface HyperliquidMarketPrice {
  coin: string;
  markPrice: number;
  oraclePrice: number;
  timestamp: number;
}

export class HyperliquidConnector {
  private apiUrl: string;
  private wsUrl: string;

  constructor(isTestnet: boolean = false) {
    this.apiUrl = isTestnet
      ? "https://api.hyperliquid-testnet.xyz/info"
      : "https://api.hyperliquid.xyz/info";
    this.wsUrl = isTestnet
      ? "wss://api.hyperliquid-testnet.xyz/ws"
      : "wss://api.hyperliquid.xyz/ws";
  }

  /**
   * Fetch all perpetual and spot metadata + mark prices from Hyperliquid L1
   */
  async getAllPrices(): Promise<Map<string, HyperliquidMarketPrice>> {
    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "allMids" }),
      });

      if (!response.ok) {
        throw new Error(`Hyperliquid API error: ${response.statusText}`);
      }

      const mids: Record<string, string> = await response.json();
      const results = new Map<string, HyperliquidMarketPrice>();
      const now = Date.now();

      for (const [coin, priceStr] of Object.entries(mids)) {
        const price = parseFloat(priceStr);
        results.set(coin, {
          coin,
          markPrice: price,
          oraclePrice: price,
          timestamp: now,
        });
      }

      return results;
    } catch (err) {
      console.error("Failed to query Hyperliquid allMids:", err);
      throw err;
    }
  }

  /**
   * Get price scaled to Astra's 8-decimal standard (1.00 = 100_000_000)
   */
  async getScaledPrice(coin: string): Promise<bigint> {
    const all = await this.getAllPrices();
    const data = all.get(coin);
    if (!data) {
      throw new Error(`Asset ${coin} not found on Hyperliquid`);
    }
    const scaled = Math.round(data.markPrice * 1e8);
    return BigInt(scaled);
  }
}
