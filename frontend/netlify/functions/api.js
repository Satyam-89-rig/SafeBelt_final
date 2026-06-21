const fs = require("fs");
const path = require("path");

const DB_FILE = "/tmp/safebelt_db.json";

// Helper to load database
function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    const seedDb = {
      scanned_count: 148,
      violations: []
    };
    
    // Seed 12 default violations
    const locations = [
      "Jaipur, RJ — Tonk Road",
      "Jaipur, RJ — Ajmer Road",
      "Jaipur, RJ — Sirsi Road",
      "Jaipur, RJ — Ring Road"
    ];
    const models = ["Maruti Swift", "Hyundai i20", "Mahindra Thar", "Honda City", "Tata Nexon", "Toyota Fortuner"];
    const colors = ["White", "Red", "Blue", "Black", "Silver", "Grey"];
    const owners = ["Suresh Kumar", "Rahul Sharma", "Priya Patel", "Anjali Gupta", "Amit Verma", "Neha Joshi"];
    const baseLat = 26.9124;
    const baseLon = 75.7873;
    
    for (let i = 0; i < 12; i++) {
      const hoursAgo = Math.random() * 23 + 0.5;
      const timestamp = new Date(Date.now() - hoursAgo * 3600000).toISOString();
      const plate = `RJ14 C${"ABCDEF"[Math.floor(Math.random() * 6)]}${Math.floor(Math.random() * 9000) + 1000}`;
      
      seedDb.violations.push({
        id: 100 + i,
        plate: plate,
        timestamp: timestamp,
        location: locations[Math.floor(Math.random() * locations.length)],
        lat: baseLat + (Math.random() - 0.5) * 0.1,
        lon: baseLon + (Math.random() - 0.5) * 0.1,
        thumbnail_b64: null,
        frame_id: i,
        vehicle_make_model: models[Math.floor(Math.random() * models.length)],
        vehicle_color: colors[Math.floor(Math.random() * colors.length)],
        fuel_type: "PETROL",
        owner_name: owners[Math.floor(Math.random() * owners.length)],
        insurance_status: Math.random() > 0.2 ? "ACTIVE" : "EXPIRED",
        puc_status: Math.random() > 0.15 ? "ACTIVE" : "EXPIRED"
      });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(seedDb, null, 2));
    return seedDb;
  }
  
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    return { scanned_count: 148, violations: [] };
  }
}

// Helper to save database
function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// Handler
exports.handler = async (event, context) => {
  const method = event.httpMethod;
  const rawPath = event.path;
  
  // Normalize path (remove /.netlify/functions/api prefix if redirected)
  const route = rawPath.replace("/.netlify/functions/api", "/api").replace("/.netlify/functions/api.js", "/api");
  
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Content-Type": "application/json"
  };
  
  // Handle CORS OPTIONS preflight
  if (method === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  
  const db = loadDb();
  
  // 1. GET /api/ocr_status
  if (route === "/api/ocr_status" && method === "GET") {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ready: true, loading: false })
    };
  }
  
  // 2. GET /api/stats
  if (route === "/api/stats" && method === "GET") {
    // Increment scanned counter on every poll to simulate highway traffic scanning
    db.scanned_count += 1;
    saveDb(db);
    
    const totalViolations = db.violations.length;
    const compliantCount = Math.max(0, db.scanned_count - totalViolations);
    const complianceRate = Math.round((compliantCount / Math.max(db.scanned_count, 1)) * 100 * 10) / 10;
    
    // Violations histogram last 24h
    const now = new Date();
    const buckets = [];
    for (let h = 23; h >= 0; h--) {
      const start = new Date(now.getTime() - (h + 1) * 3600000);
      const end = new Date(now.getTime() - h * 3600000);
      
      const count = db.violations.filter(v => {
        const vTime = new Date(v.timestamp).getTime();
        return vTime >= start.getTime() && vTime < end.getTime();
      }).length;
      
      const hourLabel = `${String(end.getHours()).padStart(2, "0")}:00`;
      buckets.push({ hour: hourLabel, count });
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        vehicles_scanned: db.scanned_count,
        violations: totalViolations,
        compliance_rate: complianceRate,
        violations_per_hour: buckets,
        live: { compliant: true, plate: null },
        ocr_ready: true,
        ocr_loading: false
      })
    };
  }
  
  // 3. GET /api/violations
  if (route === "/api/violations" && method === "GET") {
    const query = event.queryStringParameters || {};
    const page = parseInt(query.page || "1", 10);
    const page_size = parseInt(query.page_size || "20", 10);
    const date = query.date;
    const location = query.location;
    
    let filtered = [...db.violations];
    
    if (date) {
      filtered = filtered.filter(v => v.timestamp.startsWith(date));
    }
    
    if (location) {
      const locLower = location.toLowerCase();
      filtered = filtered.filter(v => (v.location || "").toLowerCase().includes(locLower));
    }
    
    // Sort descending by timestamp
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    const start = (page - 1) * page_size;
    const items = filtered.slice(start, start + page_size);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        total: filtered.length,
        page,
        page_size,
        items
      })
    };
  }
  
  // 4. POST /api/violations/manual
  if (route === "/api/violations/manual" && method === "POST") {
    try {
      const body = JSON.parse(event.body || "{}");
      const plate = (body.plate || "").trim().toUpperCase();
      
      if (!plate) {
        return {
          statusCode: 422,
          headers,
          body: JSON.stringify({ detail: "plate must not be empty" })
        };
      }
      
      const models = ["Maruti Swift", "Hyundai i20", "Mahindra Thar", "Honda City", "Tata Nexon", "Toyota Fortuner"];
      const colors = ["White", "Red", "Blue", "Black", "Silver", "Grey"];
      const owners = ["Suresh Kumar", "Rahul Sharma", "Priya Patel", "Anjali Gupta", "Amit Verma", "Neha Joshi"];
      
      const newViolation = {
        id: Date.now(),
        plate: plate,
        timestamp: new Date().toISOString(),
        location: "Jaipur, RJ — Manual Log",
        lat: 26.9124 + (Math.random() - 0.5) * 0.02,
        lon: 75.7873 + (Math.random() - 0.5) * 0.02,
        thumbnail_b64: null,
        frame_id: 999,
        vehicle_make_model: models[Math.floor(Math.random() * models.length)],
        vehicle_color: colors[Math.floor(Math.random() * colors.length)],
        fuel_type: "PETROL",
        owner_name: owners[Math.floor(Math.random() * owners.length)],
        insurance_status: Math.random() > 0.2 ? "ACTIVE" : "EXPIRED",
        puc_status: Math.random() > 0.15 ? "ACTIVE" : "EXPIRED"
      };
      
      db.violations.push(newViolation);
      saveDb(db);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(newViolation)
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ detail: "Failed to parse request body or save violation" })
      };
    }
  }
  
  // 5. POST /api/violations/bulk-delete
  if (route === "/api/violations/bulk-delete" && method === "POST") {
    try {
      const body = JSON.parse(event.body || "{}");
      const ids = body.ids || [];
      
      if (!ids || ids.length === 0) {
        return {
          statusCode: 422,
          headers,
          body: JSON.stringify({ detail: "List of ids must not be empty" })
        };
      }
      
      const initialLength = db.violations.length;
      db.violations = db.violations.filter(v => !ids.includes(v.id));
      saveDb(db);
      
      const deletedCount = initialLength - db.violations.length;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, count: deletedCount })
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ detail: "Failed to process bulk delete" })
      };
    }
  }
  
  // 6. DELETE /api/violations/:id
  const deleteMatch = route.match(/^\/api\/violations\/(\d+)$/);
  if (deleteMatch && method === "DELETE") {
    const id = parseInt(deleteMatch[1], 10);
    const initialLength = db.violations.length;
    db.violations = db.violations.filter(v => v.id !== id);
    
    if (db.violations.length < initialLength) {
      saveDb(db);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, id })
      };
    } else {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ detail: "Violation record not found" })
      };
    }
  }
  
  return {
    statusCode: 404,
    headers,
    body: JSON.stringify({ detail: `Route ${route} not found` })
  };
};
