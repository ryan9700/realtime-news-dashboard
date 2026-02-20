const express = require("express");
const Parser = require("rss-parser");
const fetch = require("node-fetch");

const app = express();
const parser = new Parser();

const PORT = process.env.PORT || 10000;

const RSS_URL = "https://www.globenewswire.com/RssFeed/subjectcode/1-News";

let newsCache = [];

function extractTickerFromBody(body) {
    const match = body.match(/\((Nasdaq|NYSE|AMEX):\s?([A-Z]+)/i);
    return match ? match[2] : null;
}

async function fetchArticle(link) {
    try {
        const response = await fetch(link);
        const text = await response.text();
        return text;
    } catch (err) {
        return null;
    }
}

async function updateNews() {
    try {
        const feed = await parser.parseURL(RSS_URL);

        const updatedItems = [];

        for (let item of feed.items.slice(0, 15)) {
            const articleHTML = await fetchArticle(item.link);
            if (!articleHTML) continue;

            const ticker = extractTickerFromBody(articleHTML);
            if (!ticker) continue;

            updatedItems.push({
                timestamp: new Date(item.pubDate).toLocaleString(),
                symbol: ticker,
                headline: item.title
            });
        }

        newsCache = updatedItems;
        console.log("News updated:", new Date().toLocaleTimeString());
    } catch (err) {
        console.log("RSS error:", err.message);
    }
}

setInterval(updateNews, 60000);
updateNews();

app.get("/", (req, res) => {
    const rows = newsCache.map(item => `
        <tr>
            <td>${item.timestamp}</td>
            <td><strong>${item.symbol}</strong></td>
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
            </style>
        </head>
        <body>
            <h2>GlobeNewswire Realtime Feed</h2>
            <table>
                <tr>
                    <th>Timestamp</th>
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
