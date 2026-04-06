require("dotenv").config();
const express = require("express");
const axios = require("axios");
const puppeteer = require("puppeteer"); // ✅ Replaced Cheerio
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// 🔹 Scrape website using Puppeteer (Multimodal/Visual Render)
async function scrapeWebsite(url) {
  let browser;
  try {
    // On Render, we often need these args to run puppeteer correctly
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    
    const page = await browser.newPage();
    
    // Set a standard viewport
    await page.setViewport({ width: 1280, height: 800 });

    // Navigate to URL and wait until network is idle (important for React apps)
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // ✅ OPTIONAL: Take a screenshot for future multimodal analysis
    // const screenshot = await page.screenshot({ encoding: 'base64' });

    // Extract visible text from the page
    const text = await page.evaluate(() => document.body.innerText);

    await browser.close();
    
    // Clean and trim text to stay within token limits
    return text.replace(/\s+/g, " ").trim().substring(0, 4000);
  } catch (error) {
    if (browser) await browser.close();
    console.error("Puppeteer Error:", error.message);
    throw new Error("Failed to render page");
  }
}

// 🔹 Call Oxlo API
async function generateTests(content) {
  try {
    const response = await axios.post(
      "https://api.oxlo.ai/v1/chat/completions",
      {
        model: "deepseek-v3.2",
        messages: [
          {
            role: "system",
            content: "You are a senior QA automation engineer. Analyze the provided webpage content and generate high-quality testing documentation.",
          },
          {
            role: "user",
            content: `
Analyze this webpage and respond STRICTLY in valid JSON.
Return ONLY this structure:
{
  "test_cases": ["..."],
  "edge_cases": ["..."],
  "cypress_code": "...",
  "bugs": ["..."],
  "auth_detected": true
}

Rules:
- test_cases: functional user flows
- edge_cases: unusual/failure scenarios
- cypress_code: complete Cypress test file (.cy.js format)
- bugs: UI/UX issues or missing labels
- auth_detected: true if login/signup exists

Content:
${content}
          `,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OXLO_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const raw = response.data.choices[0].message.content;

    // Clean potential markdown formatting if AI includes it
    const cleanJson = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleanJson);

  } catch (err) {
    console.error("AI/JSON Error:", err.message);
    return { error: "AI processing failed", details: err.message };
  }
}

// 🔹 API endpoint
app.post("/analyze", async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || !url.startsWith("http")) {
      return res.status(400).json({ error: "Invalid URL" });
    }

    const content = await scrapeWebsite(url);
    const result = await generateTests(content);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});