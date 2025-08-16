/**
 * Netlify Function: Global schedule store (GET to read, PUT/POST to write).
 * Uses Netlify Blobs as a simple persistent store.
 */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};

const defaultSchedule = {
  version: 1,
  tz: "Europe/Podgorica",
  days: [
    { name: "Ponedjeljak", closed: false, open: "10:00", close: "20:00" },
    { name: "Utorak",     closed: false, open: "10:00", close: "20:00" },
    { name: "Srijeda",    closed: false, open: "10:00", close: "20:00" },
    { name: "Četvrtak",   closed: false, open: "10:00", close: "20:00" },
    { name: "Petak",      closed: false, open: "10:00", close: "20:00" },
    { name: "Subota",     closed: false, open: "10:00", close: "14:00" },
    { name: "Nedjelja",   closed: true,  open: null,    close: null    },
  ]
};

exports.handler = async (event, context) => {
  // Lazy import to work in CommonJS
  const { getStore } = await import("@netlify/blobs");
  const store = getStore("work-hours"); // a single named store for this site

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }

  if (event.httpMethod === "GET") {
    try {
      const current = await store.get("schedule", { type: "json" });
      const data = current || defaultSchedule;
      return {
        statusCode: 200,
        headers: { ...cors, "Content-Type": "application/json" },
        body: JSON.stringify(data)
      };
    } catch (e) {
      return {
        statusCode: 200,
        headers: { ...cors, "Content-Type": "application/json" },
        body: JSON.stringify(defaultSchedule)
      };
    }
  }

  if (event.httpMethod === "PUT" || event.httpMethod === "POST") {
    try {
      const body = JSON.parse(event.body || "{}");

      // Minimal validation
      if (!body || !Array.isArray(body.days) || body.days.length !== 7) {
        return { statusCode: 400, headers: cors, body: "Invalid payload" };
      }

      // sanitize items a bit
      body.version = 1;
      body.tz = body.tz || "Europe/Podgorica";
      body.days = body.days.map((d, i) => ({
        name: d.name || defaultSchedule.days[i].name,
        closed: !!d.closed,
        open: d.closed ? null : d.open || "10:00",
        close: d.closed ? null : d.close || (i === 5 ? "14:00" : "20:00"),
      }));

      // Persist
      await store.set("schedule", JSON.stringify(body), { contentType: "application/json" });

      return {
        statusCode: 200,
        headers: { ...cors, "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true })
      };
    } catch (e) {
      return { statusCode: 500, headers: cors, body: "Server error" };
    }
  }

  return { statusCode: 405, headers: cors, body: "Method Not Allowed" };
};