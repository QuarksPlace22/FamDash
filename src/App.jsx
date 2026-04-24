import { useEffect, useState } from "react";
import ICAL from "ical.js";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import "./App.css";

const CALENDAR_API_URL = "http://localhost:3001/api/calendar";
const WEATHER_API_URL = "http://localhost:3001/api/weather";

function isCozyWeather(weatherCode, precipitation) {
  const rainyCodes = [
    51, 53, 55, 56, 57,
    61, 63, 65, 66, 67,
    71, 73, 75, 77,
    80, 81, 82, 85, 86,
    95, 96, 99,
  ];

  return rainyCodes.includes(weatherCode) || precipitation > 0;
}

function weatherLabel(weatherCode) {
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return "Snow";
  if ([95, 96, 99].includes(weatherCode)) return "Storm";
  if ([1, 2, 3].includes(weatherCode)) return "Cloudy";
  if (weatherCode === 0) return "Clear";
  return "Weather";
}

function weatherEmoji(weatherCode, cozyMode) {
  if (cozyMode) {
    if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return "❄️";
    if ([95, 96, 99].includes(weatherCode)) return "⛈️";
    return "🌧️";
  }

  if (weatherCode === 0) return "☀️";
  if ([1, 2, 3].includes(weatherCode)) return "⛅";
  return "🌤️";
}

function App() {
  const [activities, setActivities] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const [lastCalendarRefresh, setLastCalendarRefresh] = useState("");

  const [weather, setWeather] = useState(null);
  const [weatherError, setWeatherError] = useState("");

  const [shopping, setShopping] = useState([]);
  const [shoppingError, setShoppingError] = useState("");
  const [newItem, setNewItem] = useState("");

  async function fetchCalendar() {
    setCalendarLoading(true);
    setCalendarError("");

    try {
      const response = await fetch(CALENDAR_API_URL);

      if (!response.ok) {
        throw new Error(`Calendar proxy returned HTTP ${response.status}`);
      }

      const text = await response.text();

      if (!text.includes("BEGIN:VCALENDAR")) {
        throw new Error("Calendar response was not a valid ICS calendar.");
      }

      const jcalData = ICAL.parse(text);
      const calendarComponent = new ICAL.Component(jcalData);
      const calendarEvents = calendarComponent.getAllSubcomponents("vevent");

      const now = new Date();

      const todayEvents = calendarEvents
        .map((eventComponent) => new ICAL.Event(eventComponent))
        .filter((event) => {
          const start = event.startDate.toJSDate();

          return (
            start.getDate() === now.getDate() &&
            start.getMonth() === now.getMonth() &&
            start.getFullYear() === now.getFullYear()
          );
        })
        .map((event) => {
          const startDate = event.startDate.toJSDate();

          return {
            id: event.uid || `${event.summary}-${startDate.toISOString()}`,
            time: startDate.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            sortTime: startDate.getTime(),
            title: event.summary || "Untitled event",
            note: event.description || "",
          };
        })
        .sort((a, b) => a.sortTime - b.sortTime);

      setActivities(todayEvents);
      setLastCalendarRefresh(
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    } catch (error) {
      console.error("Calendar error:", error);
      setCalendarError(
        "Could not load calendar. Make sure the calendar server is running."
      );
    } finally {
      setCalendarLoading(false);
    }
  }

  async function fetchWeather() {
    setWeatherError("");

    try {
      const response = await fetch(WEATHER_API_URL);

      if (!response.ok) {
        throw new Error(`Weather proxy returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const current = data.current;

      setWeather({
        temperature: Math.round(current.temperature_2m),
        precipitation: current.precipitation || 0,
        code: current.weather_code,
      });
    } catch (error) {
      console.error("Weather error:", error);
      setWeatherError("Weather unavailable.");
    }
  }

  useEffect(() => {
    fetchCalendar();
    fetchWeather();
  }, []);

  useEffect(() => {
    const shoppingQuery = query(
      collection(db, "shopping"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      shoppingQuery,
      (snapshot) => {
        const items = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }));

        setShopping(items);
        setShoppingError("");
      },
      (error) => {
        console.error("Shopping list error:", error);
        setShoppingError("Could not load shopping list.");
      }
    );

    return () => unsubscribe();
  }, []);

  async function addItem() {
    const cleanItem = newItem.trim();

    if (!cleanItem) return;

    try {
      await addDoc(collection(db, "shopping"), {
        name: cleanItem,
        category: "General",
        bought: false,
        createdAt: serverTimestamp(),
      });

      setNewItem("");
    } catch (error) {
      console.error("Add item error:", error);
      setShoppingError("Could not add item.");
    }
  }

  async function toggleBought(item) {
    try {
      await updateDoc(doc(db, "shopping", item.id), {
        bought: !item.bought,
      });
    } catch (error) {
      console.error("Toggle item error:", error);
      setShoppingError("Could not update item.");
    }
  }

  async function removeBoughtItems() {
    const boughtItems = shopping.filter((item) => item.bought);

    try {
      await Promise.all(
        boughtItems.map((item) => deleteDoc(doc(db, "shopping", item.id)))
      );
    } catch (error) {
      console.error("Clear bought items error:", error);
      setShoppingError("Could not clear bought items.");
    }
  }

  const cozyMode =
    weather && isCozyWeather(weather.code, weather.precipitation);

  const todayLabel = new Date().toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const missingCount = shopping.filter((item) => !item.bought).length;

  return (
    <main className={`app ${cozyMode ? "cozy-mode" : "bright-mode"}`}>
      <section className="hero">
        <p className="date">{todayLabel}</p>
        <h1>Family Dashboard</h1>
        <p className="subtitle">Today’s plan and missing things</p>

        {weather && (
          <div className="weather-pill">
            <span>{weatherEmoji(weather.code, cozyMode)}</span>
            <strong>{weather.temperature}°C</strong>
            <small>
              {weatherLabel(weather.code)}
              {cozyMode ? " · cozy mode" : ""}
            </small>
          </div>
        )}

        {weatherError && <p className="weather-error">{weatherError}</p>}
      </section>

      <section className="card activities-card">
        <div className="section-header">
          <h2>Today’s activities</h2>
          <button className="small-button" onClick={fetchCalendar}>
            Refresh
          </button>
        </div>

        {calendarLoading && <p className="muted">Loading calendar...</p>}

        {calendarError && <p className="error-text">{calendarError}</p>}

        {!calendarLoading && !calendarError && activities.length === 0 && (
          <p className="muted">No events today.</p>
        )}

        <div className="activity-list">
          {activities.map((activity) => (
            <div className="activity" key={activity.id}>
              <div className="time">{activity.time}</div>
              <div>
                <strong>{activity.title}</strong>
                {activity.note && <p>{activity.note}</p>}
              </div>
            </div>
          ))}
        </div>

        {lastCalendarRefresh && (
          <p className="refresh-note">Updated at {lastCalendarRefresh}</p>
        )}
      </section>

      <section className="card shopping-card">
        <div className="section-header">
          <h2>Shopping list</h2>
          <span>{missingCount} missing</span>
        </div>

        {shoppingError && <p className="error-text">{shoppingError}</p>}

        <div className="add-row">
          <input
            value={newItem}
            onChange={(event) => setNewItem(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addItem();
            }}
            placeholder="Add missing item..."
          />
          <button onClick={addItem}>Add</button>
        </div>

        <div className="shopping-list">
          {shopping.length === 0 ? (
            <p className="muted">No shopping items yet.</p>
          ) : (
            shopping.map((item) => (
              <button
                className={`shopping-item ${item.bought ? "bought" : ""}`}
                key={item.id}
                onClick={() => toggleBought(item)}
              >
                <span>{item.name}</span>
                <small>{item.bought ? "Bought" : item.category || "General"}</small>
              </button>
            ))
          )}
        </div>

        {shopping.some((item) => item.bought) && (
          <button className="clear-button" onClick={removeBoughtItems}>
            Clear bought items
          </button>
        )}
      </section>
    </main>
  );
}

export default App;
