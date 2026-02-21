// ============================================
// REALTIME NEWS DASHBOARD
// ============================================

import express from "express";
import Parser from "rss-parser";

const app = express();
const parser = new Parser();
const PORT = process.env.PORT || 3000;


// ============================================
// KEYWORDS
// ============================================

const KEYWORDS = [
  "success","phase","upbeat","results","optimistic","outlook",
  "expansion","boost","growth","purchase","signs","project",
  "surge","acquires","acquisition","approval","fda","contract",
  "award","breakthrough","positive","launch","partnership"
];


// ============================================
// MAIN ROUTE
// ============================================

app.get("/", async (req, res) => {

  try {

    // FETCH GLOBE RSS
    const feed = await parser.parseURL(
      "https://www.globenewswire.com/RssFeed/organization/united-states"
    );

    const now = new Date();
    const results = [];

    for (const item of feed.items) {

      const headline = item.title || "";
      const description = item.contentSnippet || "";
      const combined = (headline + " " + description).toLowerCase();
      const published = new Date(item.pubDate);

      // LAST 12 HOURS
      const hoursDiff = (now - published) / (1000 * 60 * 60);
      if (hoursDiff > 12) continue;

      // KEYWORDS
      if (!KEYWORDS.some(k => combined.includes(k))) continue;

      // TICKER EXTRACTION
      const match = (headline + " " + description)
        .match(/\((NASDAQ|NYSE|AMEX):\s*([A-Z]+)\)/i);

      if (!match) continue;

      const symbol = match[2];

      // YAHOO SAFE CALL
      let yahoo = null;

      try {
        const quoteRes = await fetch(
          `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`
        );
        const quoteData = await quoteRes.json();
        yahoo = quoteData?.quoteResponse?.result?.[0] || null;
      } catch (e) {
        yahoo = null;
      }

      // PRICE FILTER
      let priceDisplay = "?";

      if (yahoo && yahoo.regularMarketPrice != null) {
        const price = yahoo.regularMarketPrice;
        priceDisplay = price.toFixed(2);
        if (price > 20) continue;
      }

      // COUNTRY FILTER
      if (yahoo && yahoo.country) {
        if (/China|Hong Kong/i.test(yahoo.country)) continue;
      }

      // OTC FILTER
      if (yahoo && yahoo.exchange) {
        if (/OTC|PNK/i.test(yahoo.exchange)) continue;
      }

      // FLOAT
      let floatDisplay = "?";
      if (yahoo && yahoo.floatShares) {
        floatDisplay = (yahoo.floatShares / 1_000_000).toFixed(1) + "M";
      }

      results.push({
        timeRaw: published,
        time: published.toLocaleString("en-US", {
          timeZone: "America/Los_Angeles"
        }),
        symbol,
        headline,
        price: priceDisplay,
        float: floatDisplay
      });
    }

    // SORT NEWEST FIRST
    results.sort((a, b) => b.timeRaw - a.timeRaw);

    // RENDER PAGE
    res.send(`
      <html>
      <head>
        <title>Realtime News Dashboard</title>
        <style>
          body { font-family: Arial; background:#111; color:#eee; padding:20px; }
          table { width:100%; border-collapse: collapse; }
          th, td { padding:10px; border-bottom:1px solid #333; }
          th { background:#222; }
          tr:hover { background:#1a1a1a; }
        </style>
      </head>
      <body>
        <h2>Realtime News (Last 12 Hours)</h2>
        <table>
          <tr>
            <th>Time (PT)</th>
            <th>Ticker</th>
            <th>Price</th>
            <th>Float</th>
            <th>Headline</th>
          </tr>
          ${results.map(r => `
            <tr>
              <td>${r.time}</td>
              <td><b>${r.symbol}</b></td>
              <td>${r.price}</td>
              <td>${r.float}</td>
              <td>${r.headline}</td>
            </tr>
          `).join("")}
        </table>
      </body>
      </html>
    `);

  } catch (err) {
    res.send("<h2>Server Error</h2><pre>" + err.message + "</pre>");
  }

});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
