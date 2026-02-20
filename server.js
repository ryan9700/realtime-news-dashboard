const express = require("express");
const Parser = require("rss-parser");
const fetch = require("node-fetch");

const app = express();
const parser = new Parser();
const PORT = process.env.PORT || 10000;

const FEEDS = [
"https://www.globenewswire.com/RssFeed/subjectcode/1-News",
"https://www.prnewswire.com/rss/news-releases-list.rss",
"https://www.businesswire.com/rss/home/?rss=G1QFDERJXkJeEFpZXQ=="
];

let newsCache = [];
let yahooCache = {};

const KEYWORDS = [
"success","phase","upbeat","results","optimistic","outlook","expansion",
"boost","growth","purchase","signs","project","surge","acquire",
"acquisition","contract","agreement","approval","fda","breakthrough",
"milestone","guidance","revenue","earnings","strategic","partnership",
"collaboration"
];

function containsKeyword(title) {
    const lower = title.toLowerCase();
    return KEYWORDS.some(word => lower.includes(word));
}

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

async function fetchYahooData(symbol) {
    if (yahooCache[symbol]) return yahooCache[symbol];

    try {
        const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=defaultKeyStatistics,price,assetProfile`;
        const response = await fetch(url);
        const data = await response.json();

        const result = data.quoteSummary.result?.[0];
        if (!result) return null;

        const stats = result.defaultKeyStatistics;
        const priceData = result.price;
        const profile = result.assetProfile;

        const floatShares = stats?.floatShares?.raw;
        const sharesOutstanding = stats?.sharesOutstanding?.raw;
        const floatValue = floatShares || sharesOutstanding || null;

        const price = priceData?.regularMarketPrice?.raw || null;
        const exchange = priceData?.exchangeName || "";
        const country = profile?.country || "";

        const info = {
            float: floatValue,
            price,
            exchange,
            country
        };

        yahooCache[symbol] = info;
        return info;

    } catch {
        return null;
    }
}

function formatMillions(value) {
    if (!value) return "?";
    return (value / 1000000).toFixed(1) + "M";
}

function floatTier(value) {
    if (!value) return "normal";
    const m = value / 1000000;
    if (m < 5) return "bright";
    if (m < 10) return "soft";
    if (m <= 20) return "normal";
    return "omit";
}

async function updateNews() {
    try {
        const now = Date.now();
        const twelveHours = 12 * 60 * 60 * 1000;
        const collected = [];

        for (let feedUrl of FEEDS) {
            const feed = await parser.parseURL(feedUrl);

            for (let item of feed.items.slice(0, 15)) {
                const pubTime = new Date(item.pubDate).getTime();
                if (now - pubTime > twelveHours) continue;
                if (!containsKeyword(item.title)) continue;

                const articleHTML = await fetchArticle(item.link);
                if (!articleHTML) continue;

                const ticker = extractTickerFromBody(articleHTML);
                if (!ticker) continue;

                const yahoo = await fetchYahooData(ticker);
                if (!yahoo) continue;

                if (!/Nasdaq|NYSE|ASE|NYQ|NMS/i.test(yahoo.exchange)) continue;
                if (yahoo.country === "China" || yahoo.country === "Hong Kong") continue;
                if (!yahoo.price || yahoo.price > 20) continue;

                const tier = floatTier(yahoo.float);
                if (tier === "omit") continue;

                collected.push({
                    timestamp: new Date(item.pubDate).toLocaleString("en-US", {
                        timeZone: "America/Los_Angeles",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false
                    }),
                    symbol: ticker,
                    headline: item.title,
                    price: yahoo.price?.toFixed(2) || "?",
                    floatDisplay: formatMillions(yahoo.float),
                    tier
                });
            }
        }

        collected.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        newsCache = collected;

        console.log("Updated:", new Date().toLocaleTimeString());
    } catch (err) {
        console.log("Update error:", err.message);
    }
}

setInterval(updateNews, 60000);
updateNews();

app.get("/", (req, res) => {
    const rows = newsCache.map(item => `
        <tr class="${item.tier}">
            <td>${item.timestamp}</td>
            <td><strong>${item.symbol}</strong></td>
            <td>$${item.price}</td>
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
                .bright { background: rgba(255,0,0,0.4); }
                .soft { background: rgba(255,165,0,0.3); }
                .normal { background: rgba(255,255,255,0.05); }
            </style>
        </head>
        <body>
            <h2>Momentum News Feed</h2>
            <table>
                <tr>
                    <th>Time (PT)</th>
                    <th>Symbol</th>
                    <th>Price</th>
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
