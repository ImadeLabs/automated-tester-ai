require("dotenv").config();
const express = require("express");
const axios = require("axios");
const puppeteer = require("puppeteer");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // Increased limit for image data

const PORT = process.env.PORT || 10000;

// ✅ FIX: Root route to prevent "Cannot GET /" and handle Render health checks
app.get("/", (req, res) => {
  res.send("AI QA Agent Backend is Running 🚀");
});

// 🔹 Multimodal Scraping (Text + Screenshot)
async function scrapeWebsite(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    // Increased timeout for heavy sites
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // ✅ MULTIMODAL STEP: Capture Screenshot as Base64
    const screenshot = await page.screenshot({ 
        encoding: "base64",
        type: "jpeg",
        quality: 70 // Compressed for faster API transmission
    });

    // Extract text
    const text = await page.evaluate(() => document.body.innerText);

    await browser.close();
    return { 
        text: text.replace(/\s+/g, " ").trim().substring(0, 3000), 
        screenshot 
    };
  } catch (error) {
    if (browser) await browser.close();
    console.error("Puppeteer Error:", error.message);
    throw error;
  }
}

// 🔹 Multimodal AI Call (DeepSeek Vision)
async function generateTests(content, screenshotBase64) {
  try {
    const response = await axios.post(
      "https://api.oxlo.ai/v1/chat/completions",
      {
        model: "deepseek-v3.2", 
        messages: [
          {
            role: "system",
            content: "You are a senior QA automation engineer. Analyze both the text and the visual screenshot provided.",
          },
          {
            role: "user",
            content: [
              { 
                type: "text", 
                text: `Analyze this webpage and respond STRICTLY in valid JSON.
                Return this structure:
                {
                  "test_cases": ["..."],
                  "edge_cases": ["..."],
                  "cypress_code": "...",
                  "bugs": ["..."],
                  "auth_detected": true
                }
                
                Content: ${content}` 
              },
              { 
                type: "image_url", 
                image_url: { url: `data:image/jpeg;base64,${screenshotBase64}` } 
              }
            ],
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
    const cleanJson = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleanJson);

  } catch (err) {
    console.error("AI Error:", err.response?.data || err.message);
    throw new Error("AI Vision Analysis Failed");
  }
}

// 🔹 API endpoint
app.post("/analyze", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.startsWith("http")) {
      return res.status(400).json({ error: "Invalid URL" });
    }

    // Get Text + Image
    const { text, screenshot } = await scrapeWebsite(url);
    
    // Send both to AI
    const result = await generateTests(text, screenshot);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});