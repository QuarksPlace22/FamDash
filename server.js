import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

const CALENDAR_ICS_URL = process.env.CALENDAR_ICS_URL;

const WEATHER_LATITUDE = 45.5017;
const WEATHER_LONGITUDE = -73.5673;

app.get("/api/calendar", async (req, res) => {
  try {
    if (!CALENDAR_ICS_URL) {
      return res.status(500).send("Calendar URL is not configured.");
    }

    const freshUrl =
      CALENDAR_ICS_URL +
      (CALENDAR_ICS_URL.includes("?") ? "&" : "?") +
      `cacheBust=${Date.now()}`;

    const response = await fetch(freshUrl, {
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(`Google Calendar returned HTTP ${response.status}`);
    }

    const text = await response.text();

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    res.send(text);
  } catch (error) {
    console.error("Calendar fetch failed:", error.message);
    res.status(500).send("Calendar fetch failed.");
  }
});

app.get("/api/weather", async (req, res) => {
  try {
    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${WEATHER_LATITUDE}` +
      `&longitude=${WEATHER_LONGITUDE}` +
      `&current=temperature_2m,precipitation,weather_code` +
      `&timezone=America%2FToronto`;

    const response = await fetch(weatherUrl);

    if (!response.ok) {
      throw new Error(`Weather API returned HTTP ${response.status}`);
    }

    const data = await response.json();

    res.setHeader("Cache-Control", "public, max-age=600");
    res.json(data);
  } catch (error) {
    console.error("Weather fetch failed:", error.message);
    res.status(500).send("Weather fetch failed.");
  }
});

app.listen(PORT, () => {
  console.log(`FamDash API running on http://localhost:${PORT}`);
});
