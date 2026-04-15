/**
 * Fetches 2 random AEON essays from their RSS feed and sends them via email.
 * Used by GitHub Actions on a daily schedule at 6 AM IST.
 *
 * Required environment variables:
 *   RESEND_API_KEY - API key from https://resend.com
 *   TO_EMAIL       - Comma-separated recipient email addresses
 */

const AEON_RSS_URL = "https://aeon.co/feed.rss";

async function fetchEssays() {
  const response = await fetch(AEON_RSS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch RSS feed: ${response.status}`);
  }
  const xml = await response.text();

  // Parse essays only (filter out videos)
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] ?? "";

    // Only include essays, skip videos
    if (!link.includes("/essays/")) continue;

    const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
    const descMatch = itemXml.match(
      /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/
    );
    const creatorMatch = itemXml.match(
      /<dc:creator><!\[CDATA\[(.*?)\]\]><\/dc:creator>/
    );
    const dateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);

    // Extract the summary text from the description HTML
    const descHtml = descMatch?.[1] ?? "";
    const summaryMatch = descHtml.match(/<\/p><p>(.*?)<\/p><p><em>/s);
    const summary = summaryMatch?.[1]?.replace(/<[^>]*>/g, "").trim() ?? "";

    items.push({
      title: titleMatch?.[1] ?? "Untitled",
      link: link.replace("?utm_source=rss-feed", ""),
      author: creatorMatch?.[1] ?? "Unknown",
      date: dateMatch?.[1] ?? "",
      summary,
    });
  }

  if (items.length < 2) {
    throw new Error(
      `Only found ${items.length} essays in feed, need at least 2`
    );
  }

  // Pick 2 random essays
  const shuffled = items.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2);
}

function buildEmailHtml(essays) {
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Kolkata",
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; background: #fafafa; }
    .header { border-bottom: 2px solid #1a1a2e; padding-bottom: 12px; margin-bottom: 24px; }
    .header h1 { font-size: 22px; margin: 0; color: #1a1a2e; }
    .header p { margin: 4px 0 0; color: #666; font-size: 14px; }
    .essay { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    .essay h2 { font-size: 18px; margin: 0 0 6px; }
    .essay h2 a { color: #1a1a2e; text-decoration: none; }
    .essay h2 a:hover { text-decoration: underline; }
    .essay .meta { font-size: 13px; color: #888; margin-bottom: 10px; }
    .essay .summary { font-size: 15px; line-height: 1.6; color: #444; }
    .footer { text-align: center; font-size: 12px; color: #999; margin-top: 30px; }
    .cta { display: inline-block; margin-top: 12px; padding: 8px 16px; background: #1a1a2e; color: #fff !important; text-decoration: none; border-radius: 4px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Your Daily AEON Essays</h1>
    <p>${today} &mdash; CAT Reading Practice</p>
  </div>
  ${essays
    .map(
      (e, i) => `
  <div class="essay">
    <h2><a href="${e.link}">${i + 1}. ${e.title}</a></h2>
    <div class="meta">by ${e.author}</div>
    <div class="summary">${e.summary}</div>
    <a class="cta" href="${e.link}">Read Full Essay</a>
  </div>`
    )
    .join("\n")}
  <div class="footer">
    <p>Tip: Read actively &mdash; summarize each paragraph, note the author's argument structure, and identify vocabulary words.</p>
    <p>These essays build your reading comprehension &amp; verbal ability for CAT.</p>
  </div>
</body>
</html>`;
}

async function sendEmail(html, essays) {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.TO_EMAIL;

  if (!apiKey) throw new Error("RESEND_API_KEY environment variable is required");
  if (!toEmail) throw new Error("TO_EMAIL environment variable is required");

  const recipients = toEmail.split(",").map((e) => e.trim());
  const subject = `AEON Daily: ${essays.map((e) => e.title).join(" & ")}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "AEON Daily <onboarding@resend.dev>",
      to: recipients,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send email: ${response.status} - ${error}`);
  }

  const result = await response.json();
  console.log("Email sent successfully! ID:", result.id);
  return result;
}

async function main() {
  console.log("Fetching AEON essays...");
  const essays = await fetchEssays();
  console.log(`Selected ${essays.length} essays:`);
  essays.forEach((e) => console.log(`  - "${e.title}" by ${e.author}`));

  const html = buildEmailHtml(essays);

  console.log("\nSending email...");
  await sendEmail(html, essays);
  console.log("Done!");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
