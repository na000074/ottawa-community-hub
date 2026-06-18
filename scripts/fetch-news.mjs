import { mkdir, readFile, writeFile } from "node:fs/promises";

const FEED_URLS = [
  "https://www.cbc.ca/cmlink/rss-canada-ottawa",
  "https://news.google.com/rss/search?q=%22Ottawa%22%20Ontario%20community%20OR%20transit%20OR%20housing%20OR%20students&hl=en-CA&gl=CA&ceid=CA:en",
];

const outputPath = new URL("../public/news.json", import.meta.url);

function textBetween(source, tag) {
  const match = source.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim()) : "";
}

function decodeXml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function cleanTitle(title) {
  return title.replace(/\s-\s[^-]+$/, "").trim();
}

async function writeNews(items) {
  await mkdir(new URL("../public/", import.meta.url), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify({ updatedAt: new Date().toISOString(), items }, null, 2)}\n`,
    "utf8",
  );
}

function parseFeed(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
    const item = match[1];
    const published = textBetween(item, "pubDate");
    const title = cleanTitle(textBetween(item, "title") || "Ottawa news update");
    const body = textBetween(item, "source") || "Ottawa news";
    const url = textBetween(item, "link") || textBetween(item, "guid");
    return {
      tag: "blue",
      cat: "Live feed",
      title,
      body,
      time: published
        ? new Date(published).toLocaleDateString("en-CA", { month: "short", day: "numeric" })
        : "Latest",
      url,
      source: "Live feed",
    };
  });
}

async function fetchFeed(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; OttawaCommunityHub/1.0; +https://ottawaconfession.ca)",
      Accept: "application/rss+xml, application/xml, text/xml",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`);
  return parseFeed(await response.text());
}

try {
  const results = await Promise.allSettled(FEED_URLS.map(fetchFeed));
  const seen = new Set();
  const items = results
    .flatMap(result => result.status === "fulfilled" ? result.value : [])
    .filter(item => {
      const key = item.title.toLowerCase();
      if (!item.url || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 15);

  if (items.length === 0) {
    throw new Error(results
      .filter(result => result.status === "rejected")
      .map(result => result.reason?.message)
      .join("; ") || "No RSS items were returned");
  }

  await writeNews(items);
  console.log(`Wrote ${items.length} live news items to public/news.json`);
} catch (error) {
  console.warn(`Could not fetch live news: ${error.message}`);
  try {
    const existing = JSON.parse(await readFile(outputPath, "utf8"));
    if (!Array.isArray(existing.items) || existing.items.length === 0) throw new Error("No saved headlines");
    console.warn(`Keeping ${existing.items.length} previously saved headlines.`);
  } catch {
    await writeNews([]);
  }
}
