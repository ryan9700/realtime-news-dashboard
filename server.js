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

const RSS_URL = "https://www.globenewswire.com/RssFeed";

// ===============================
// KEYWORD FILTER (Momentum Bias)
// ===============================
const KEYWORDS = [
    "phase", "trial", "fda", "approval", "breakthrough", "drug", "positive",
    "acquire", "acquisition", "merger", "strategic", "strategy", "secure",
    "partnership", "collaboration", "contract", "award",
    "agreement", "grant", "expansion", "launch",
    "results", "earnings", "revenue", "guidance",
    "growth", "surge", "boost", "optimistic",
    "milestone", "successful", "positive",
    "upbeat", "transform", "ai", "technology",
    "deployment", "commercial", "production",
    "losses", "rights", "investors"
];

function containsKeyword(title) {
    const lower = title.toLowerCase();
    return KEYWORDS.some(word => lower.includes(word));
}

// ===============================
// MEMORY CACHE
// ===============================
let newsCache = [];
let floatCache = {};

// ===============================
// TICKER EXTRACTION (Hybrid, Priority-Based)
// ===============================
function extractTicker(title, body) {

    // PRIORITY 1: (NASDAQ: TICK) or (NYSE: TICK) format
    const exchangeMatch = title.match(/\((Nasdaq|NYSE|AMEX):\s?([A-Z]{1,5})\)/i);
    if (exchangeMatch) return exchangeMatch[2];

    // PRIORITY 2: simple (TICK) in headline
    const simpleTitleMatch = title.match(/\(([A-Z]{1,5})\)/);
    if (simpleTitleMatch) return simpleTitleMatch[1];

    // PRIORITY 3: exchange format in body
    const bodyExchangeMatch = body.match(/\((Nasdaq|NYSE|AMEX):\s?([A-Z]{1,5})\)/i);
    if (bodyExchangeMatch) return bodyExchangeMatch[2];

    return null;
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
// FLOAT FETCH (Finnhub profile2)
// ===============================
async function fetchFloat(symbol) {

    if (floatCache[symbol] !== undefined) return floatCache[symbol];

    try {

        const apiKey = process.env.FINNHUB_API_KEY;

        const response = await fetch(
            `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${apiKey}`
        );

        const data = await response.json();

        const sharesOutstanding = data?.shareOutstanding;

        const value = sharesOutstanding ? sharesOutstanding * 1000000 : null;

        floatCache[symbol] = value;

        return value;

    } catch (err) {
        console.log("Finnhub error for", symbol, err.message);
        return null;
    }
}

function formatMillions(value) {
    if (!value) return "?";
    return (value / 1000000).toFixed(1) + "M";
}

// ===============================
// PRICE FETCH (Finnhub quote)
// ===============================
async function fetchPrice(symbol) {

    try {

        const apiKey = process.env.FINNHUB_API_KEY;

        const response = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`
        );

        const data = await response.json();

        return {
            price: data?.c || null,
            prevClose: data?.pc || null
        };

    } catch (err) {
        console.log("Price error for", symbol);
        return null;
    }
}

// ===============================
// FLOAT TIER CLASSIFICATION
// ===============================
function floatTierClass(value) {

    if (!value) return "";

    const millions = value / 1000000;

    if (millions < 5) return "tier-bright";
    if (millions < 10) return "tier-soft";
    if (millions <= 20) return "tier-normal";

    return "tier-high";
}

// ===============================
// EXCHANGE FILTER
// ===============================
function isMajorUSTicker(ticker) {

    // Block if contains dot (foreign suffix like .TO, .HK)
    if (ticker.includes(".")) return false;

    // Block if longer than 5 chars (most OTC weird tickers)
    if (ticker.length > 5) return false;

    return true;
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
        
            // 🔎 KEYWORD FILTER (before any API calls)
            if (!containsKeyword(item.title)) continue;
            
            const pubTime = new Date(item.pubDate).getTime();
            if (now - pubTime > twelveHours) continue;

            const articleHTML = await fetchArticle(item.link);
            if (!articleHTML) continue;

            const ticker = extractTicker(item.title, articleHTML);
            if (!ticker) continue;

            // 🔵 EXCHANGE FILTER
            if (!isMajorUSTicker(ticker)) continue;
            
            const floatValue = await fetchFloat(ticker);
            const priceData = await fetchPrice(ticker);

            if (!floatValue || !priceData || !priceData.price) continue;

            // 🔴 PRICE FILTER — omit over $20
            if (priceData.price > 20) continue;

            const percentChange = priceData.prevClose
                ? ((priceData.price - priceData.prevClose) / priceData.prevClose) * 100
                : 0;
            

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
        headline: item.title,
        floatDisplay: formatMillions(floatValue),
        tier: floatTierClass(floatValue),
        price: priceData.price ? priceData.price.toFixed(2) : "?",
        change: percentChange.toFixed(2)
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
    <tr class="${item.tier}">
        <td>${item.timestamp}</td>
        <td>
            <a href="https://www.tradingview.com/chart/?symbol=NASDAQ:${item.symbol}" 
                target="_blank"
                style="color:#4da6ff; text-decoration:none;">
                <strong>${item.symbol}</strong>
            </a>
        </td>
        <td>$${item.price}</td>
        <td class="${item.change >= 0 ? 'green' : 'red'}">
            ${item.change}%
        </td>
        <td>${item.floatDisplay}</td>
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
                .tier-bright { background: rgba(255, 0, 0, 0.35); }
                .tier-soft   { background: rgba(255, 165, 0, 0.30); }
                .tier-normal { background: rgba(255, 255, 255, 0.05); }
                .tier-high   { opacity: 0.4; }
                .green { color: #00ff88; }
                .red { color: #ff4d4d; }
            </style>
        </head>
        <body>
            <h2>GlobeNewswire Feed (Ticker Filter Only)</h2>
            <table>
                <tr>
                    <th>Timestamp (PT)</th>
                    <th>Symbol</th>
                    <th>Price</th>
                    <th>% Change</th>
                    <th>Float</th>
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
