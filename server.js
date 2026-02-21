// ============================================
// DEPENDENCIES
// ============================================

const express = require("express");
const Parser = require("rss-parser");
const fetch = require("node-fetch");

const app = express();
const parser = new Parser();
const PORT = process.env.PORT || 10000;


// ============================================
// CONFIGURATION
// ============================================

const RSS_URL = "https://www.globenewswire.com/RssFeed/subjectcode/1-News";

let newsCache = [];
let floatCache = {};


// ============================================
// KEYWORD LIST
// ============================================

const KEYWORDS = [
"success","phase","upbeat","results","optimistic","outlook","expansion",
"boost","growth","purchase","signs","project","surge","acquire",
"acquisition","contract","agreement","approval","fda","breakthrough",
"milestone","guidance","revenue","earnings","strategic","partnership",
"collaboration"
];


// ============================================
// HELPER: KEYWORD CHECK
// ============================================

function containsKeyword(title) {
    const lower = title.toLowerCase();
    return KEYWORDS.some(word => lower.includes(word));
}


// ============================================
// HELPER: EXTRACT TICKER FROM ARTICLE BODY
// ============================================

function extractTickerFromBody(body) {
    const match = body.match(/\((Nasdaq|NYSE|AMEX):\s?([A-Z]+)/i);
    return match ? match[2] : null;
}


// ============================================
// HELPER: FETCH FULL ARTICLE HTML
// ============================================

async function fetchArticle(link) {
    try {
        const response = await fetch(link);
        return await response.text();
    } catch {
        return null;
    }
}


// ============================================
// HELPER: FETCH FLOAT (YAHOO)
// ============================================

async function fetchFloat(symbol) {
    if (floatCache[symbol]) return floatCache[symbol];

    try {
        const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=defaultKeyStatistics`;
        const response = await fetch(url);
        const data = await response.json();

        const stats = data.quoteSummary.result?.[0]?.defaultKeyStatistics;
        let floatShares = stats?.floatShares?.raw;
        let sharesOutstanding = stats?.sharesOutstanding?.raw;

        let value = floatShares || sharesOutstanding || null;

        floatCache[symbol] = value;
        return value;
    } catch {
        return null;
    }
}


// ============================================
// HELPER: FORMAT FLOAT IN MILLIONS
// ============================================

function formatMillions(value) {
    if (!value) return "?";
    return (value / 1000000).toFixed(1) + "M";
}


// ============================================
// HELPER: FLOAT TIER CLASSIFICATION
// ============================================

function floatTierClass(value) {
    if (!value) return "";
    const millions = value / 1000000;

    if (millions < 5) return "tier-bright";
    if (millions < 10) return "tier-soft";
    if (millions <= 20) return "tier-normal";
    return "omit";
}


// ============================================
// MAIN NEWS UPDATE FUNCTION
// ============================================

async function updateNews() {
    try {
        const feed = await parser.parseURL(RSS_URL);
        const now = Date.now();
        const twelveHours = 12 * 60 * 60 * 1000;

        const updatedItems = [];

        for (let item of feed.items.slice(0, 15)) {

            const pubTime = new Date(item.pubDate).getTime();
            if (now - pubTime > twelveHours) continue;

            if (!containsKeyword(item.title)) continue;

            const articleHTML = await fetchArticle(item.link);
            if (!articleHTML) continue;

            const ticker = extractTickerFromBody(articleHTML);
            if (!ticker) continue;

            const floatValue = await fetchFloat(ticker);
            const tier = floatTierClass(floatValue);

            if (tier === "omit") continue;

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
                tier
            });
        }

        updatedItems.sort((a, b) =>
            new Date(b.timestamp) - new Date(a.timestamp)
        );

        newsCache = updatedItems;

        console.log("Updated:", new Date().toLocaleTimeString());

    } catch (err) {
        console.log("Error:", err.message);
    }
}


// ============================================
// AUTO REFRESH LOOP
// ============================================

setInterval(updateNews, 60000);
updateNews();


// ============================================
// WEB ROUTE
// ============================================

app.get("/", (req, res) => {

    const rows = newsCache.map(item => `
        <tr class="${item.tier}">
            <td>${item.timestamp}</td>
            <td><strong>${item.symbol}</strong></td>
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
                .tier-bright { background: rgba(255,0,0,0.4); }
                .tier-soft { background: rgba(255,165,0,0.3); }
                .tier-normal { background: rgba(255,255,255,0.05); }
            </style>
        </head>
        <body>
            <h2>GlobeNewswire Momentum Feed</h2>
            <table>
                <tr>
                    <th>Timestamp (PT)</th>
                    <th>Symbol</th>
                    <th>Float</th>
                    <th>Headline</th>
                </tr>
                ${rows}
            </table>
        </body>
        </html>
    `);
});


// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
    console.log("Server running on port", PORT);
});
