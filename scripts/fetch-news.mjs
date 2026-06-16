import { mkdir, writeFile } from "node:fs/promises";

const FEED_URL =
  "https://news.google.com/rss/search?q=Ottawa%20community%20OR%20transit%20OR%20housing%20OR%20students&hl=en-CA&gl=CA&ceid=CA:en";

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
    .replace(/&#39;/g, "'");
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

try {
  const response = await fetch(FEED_URL, {
    headers: {
      "User-Agent": "OttawaCommunityHub/1.0",
    },
  });
  if (!response.ok) throw new Error(`Google News returned ${response.status}`);

  const xml = await response.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 12).map((match) => {
    const item = match[1];
    const published = textBetween(item, "pubDate");
    return {
      tag: "blue",
      cat: "Live feed",
      title: cleanTitle(textBetween(item, "title") || "Ottawa news update"),
      body: textBetween(item, "source") || "Google News",
      time: published
        ? new Date(published).toLocaleDateString("en-CA", { month: "short", day: "numeric" })
        : "Latest",
      url: textBetween(item, "link"),
      source: "Live feed",
    };
  });

  await writeNews(items);
  console.log(`Wrote ${items.length} live news items to public/news.json`);
} catch (error) {
  console.warn(`Could not fetch live news: ${error.message}`);
  await writeNews([]);
}
