// ===============================
// IMPORTS
// ===============================
const express = require("express");
const Parser = require("rss-parser");
const fetch = require("node-fetch");

const app = express();
const parser = new Parser();
const PORT = process.env.PORT || 10000;

// ===============================
// RSS SOURCE
// ===============================
const RSS_URL = "https://www.globenewswire.com/RssFeed/subjectcode/1-News";

// ===============================
// MEMORY CACHE
// ===============================
let newsCache = [];

// ===============================
// TICKER EXTRACTION
// ===============================
function extractTickerFromBody(body) {
    const match = body.match(/\((Nasdaq|NYSE|AMEX):\s?([A-Z]+)/i);
    return match ? match[2] : null;
}

async function fetchArticle(link) {
    try {
        const response = await fetch(link);
        return await response.text();
    } catch {
        return null;
    }
}

// ===============================
// NEWS UPDATE FUNCTION
// ===============================
async function updateNews() {
    try {
        const feed = await parser.parseURL(RSS_URL);
        const now = Date.now();
        const twelveHours = 12 * 60 * 60 * 1000;

        const updatedItems = [];

        for (let item of feed.items.slice(0, 20)) {

            const pubTime = new Date(item.pubDate).getTime();
            if (now - pubTime > twelveHours) continue;

            const articleHTML = await fetchArticle(item.link);
            if (!articleHTML) continue;

            const ticker = extractTickerFromBody(articleHTML);
            if (!ticker) continue;   // ✅ ONLY FILTER: must have ticker

            updatedItems.push({
                timestamp: new Date(item.pubDate).toLocaleString("en-US", {
                    timeZone: "America/Los_Angeles",
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false
                }),
                symbol: ticker,
                headline: item.title
            });
        }

        // Sort newest first
        updatedItems.sort((a, b) =>
            new Date(b.timestamp) - new Date(a.timestamp)
        );

        newsCache = updatedItems;

        console.log("Updated:", new Date().toLocaleTimeString());
    } catch (err) {
        console.log("Error:", err.message);
    }
}

setInterval(updateNews, 60000);
updateNews();

// ===============================
// WEB DISPLAY
// ===============================
app.get("/", (req, res) => {

    const rows = newsCache.map(item => `
        <tr>
            <td>${item.timestamp}</td>
            <td>
                <a href="https://www.tradingview.com/chart/?symbol=NASDAQ:${item.symbol}" 
                   target="_blank"
                   style="color:#4da6ff; text-decoration:none;">
                   <strong>${item.symbol}</strong>
                </a>
            </td>
            <td>${item.headline}</td>
        </tr>
    `).join("");

    res.send(`
        <html>
        <head>
            <meta http-equiv="refresh" content="30">
            <style>
                body { font-family: Arial; background: #111; color: #eee; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 8px; border-bottom: 1px solid #333; }
                th { background: #222; }
                tr:hover { background: #1a1a1a; }
                a:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <h2>GlobeNewswire Feed (Ticker Filter Only)</h2>
            <table>
                <tr>
                    <th>Timestamp (PT)</th>
                    <th>Symbol</th>
                    <th>Headline</th>
                </tr>
                ${rows}
            </table>
        </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log("Server running on port", PORT);
});
