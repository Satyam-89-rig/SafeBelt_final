import { API_BASE_URL } from "./config";

// --- Seeding default data ---
const SEED_VIOLATIONS = [
  {
    id: 101,
    plate: "RJ14 CG 9481",
    timestamp: new Date(Date.now() - 3600000 * 1.5).toISOString(),
    compliant: false,
    vehicle_details: {
      model: "Hyundai i20",
      color: "White",
      owner: "Satyam Singhal",
      insurance_status: "Active",
      puc_status: "Active"
    }
  },
  {
    id: 102,
    plate: "RJ20 DE 4591",
    timestamp: new Date(Date.now() - 3600000 * 3.2).toISOString(),
    compliant: false,
    vehicle_details: {
      model: "Maruti Swift",
      color: "Blue",
      owner: "Aman Sharma",
      insurance_status: "Expired",
      puc_status: "Active"
    }
  },
  {
    id: 103,
    plate: "RJ06 GH 1024",
    timestamp: new Date(Date.now() - 3600000 * 6.8).toISOString(),
    compliant: false,
    vehicle_details: {
      model: "Mahindra Thar",
      color: "Black",
      owner: "Vikram Singh",
      insurance_status: "Active",
      puc_status: "Expired"
    }
  }
];

const CAR_MODELS = ["Maruti Swift", "Hyundai i20", "Mahindra Thar", "Honda City", "Tata Nexon", "Toyota Fortuner"];
const CAR_COLORS = ["White", "Red", "Blue", "Black", "Silver", "Grey"];
const OWNERS = ["Suresh Kumar", "Rahul Sharma", "Priya Patel", "Anjali Gupta", "Amit Verma", "Neha Joshi"];

function generateRandomVehicleDetails(plate) {
  const model = CAR_MODELS[Math.floor(Math.random() * CAR_MODELS.length)];
  const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  const owner = OWNERS[Math.floor(Math.random() * OWNERS.length)];
  const insurance_status = Math.random() > 0.2 ? "Active" : "Expired";
  const puc_status = Math.random() > 0.15 ? "Active" : "Expired";
  return { model, color, owner, insurance_status, puc_status };
}

// Ensure database state in localStorage
if (!localStorage.getItem("safebelt_violations")) {
  localStorage.setItem("safebelt_violations", JSON.stringify(SEED_VIOLATIONS));
}
if (!localStorage.getItem("safebelt_scanned_count")) {
  localStorage.setItem("safebelt_scanned_count", "148");
}

const getViolations = () => JSON.parse(localStorage.getItem("safebelt_violations") || "[]");
const saveViolations = (list) => localStorage.setItem("safebelt_violations", JSON.stringify(list));
const getScannedCount = () => parseInt(localStorage.getItem("safebelt_scanned_count") || "0", 10);
const incrementScannedCount = () => {
  const count = getScannedCount() + 1;
  localStorage.setItem("safebelt_scanned_count", count.toString());
  return count;
};

// Global mode state
window.isSimulationMode = false;
window.mockLiveState = { compliant: true, plate: null };

// Check connection to the API
export async function initializeMockDetector() {
  const checkUrl = API_BASE_URL ? `${API_BASE_URL}/api/ocr_status` : "/api/ocr_status";
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(checkUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (res.ok) {
      console.log("SafeBelt Backend: Connected to live API.");
      window.isSimulationMode = false;
    } else {
      throw new Error("HTTP error status");
    }
  } catch (err) {
    console.warn("SafeBelt Backend offline — entering Cloud Simulation Mode.");
    window.isSimulationMode = true;
    window.dispatchEvent(new CustomEvent("api-mode-change", { detail: { simulation: true } }));
    interceptFetch();
  }
}

// Intercept window.fetch to redirect requests when in simulation mode
function interceptFetch() {
  const originalFetch = window.fetch;
  
  window.fetch = async function (input, init) {
    if (!window.isSimulationMode) {
      return originalFetch(input, init);
    }
    
    const urlString = typeof input === "string" ? input : input.url;
    
    // Parse URL using standard browser API
    // If input is relative, resolve it against window.location.origin
    const parsedUrl = new URL(urlString, window.location.origin);
    const route = parsedUrl.pathname;
    const query = parsedUrl.searchParams;
    const method = (init?.method || "GET").toUpperCase();
    
    // --- Route 1: GET /api/ocr_status ---
    if (route === "/api/ocr_status") {
      return new Response(JSON.stringify({ ready: true, loading: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // --- Route 2: GET /api/stats ---
    if (route === "/api/stats") {
      const violations = getViolations();
      const scanned = getScannedCount();
      const complianceRate = scanned > 0 ? Math.round(((scanned - violations.length) / scanned) * 100 * 10) / 10 : 100;
      
      // Generate hourly distribution
      const buckets = [];
      const now = new Date();
      for (let h = 23; h >= 0; h--) {
        const time = new Date(now.getTime() - h * 3600 * 1000);
        // Find violations in this hour
        const count = violations.filter(v => {
          const vDate = new Date(v.timestamp);
          return vDate.getHours() === time.getHours() && (now.getTime() - vDate.getTime()) < 24 * 3600 * 1000;
        }).length;
        buckets.push({
          hour: `${String(time.getHours()).padStart(2, "0")}:00`,
          count: count
        });
      }
      
      return new Response(JSON.stringify({
        vehicles_scanned: scanned,
        violations: violations.length,
        compliance_rate: complianceRate,
        violations_per_hour: buckets,
        live: window.mockLiveState,
        ocr_ready: true,
        ocr_loading: false
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // --- Route 3: GET /api/violations ---
    if (route === "/api/violations" && method === "GET") {
      let violations = getViolations();
      
      // Apply search filter
      const search = query.get("search") || "";
      if (search) {
        const lowerSearch = search.toLowerCase();
        violations = violations.filter(v => 
          v.plate.toLowerCase().includes(lowerSearch) ||
          (v.vehicle_details?.model || "").toLowerCase().includes(lowerSearch) ||
          (v.vehicle_details?.owner || "").toLowerCase().includes(lowerSearch)
        );
      }
      
      // Sort by timestamp desc
      violations.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      const page = parseInt(query.get("page") || "1", 10);
      const limit = parseInt(query.get("page_size") || "10", 10);
      const startIdx = (page - 1) * limit;
      const endIdx = startIdx + limit;
      const paginated = violations.slice(startIdx, endIdx);
      const totalPages = Math.ceil(violations.length / limit);
      
      return new Response(JSON.stringify({
        items: paginated,
        total: violations.length,
        pages: totalPages
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // --- Route 4: POST /api/violations/manual ---
    if (route === "/api/violations/manual" && method === "POST") {
      try {
        let body = {};
        if (init && init.body) {
          body = JSON.parse(init.body);
        }
        
        const plate = (body.plate || "UNKNOWN").toUpperCase();
        const violations = getViolations();
        
        const newViolation = {
          id: Date.now(),
          plate: plate,
          timestamp: new Date().toISOString(),
          compliant: false,
          vehicle_details: generateRandomVehicleDetails(plate)
        };
        
        violations.push(newViolation);
        saveViolations(violations);
        incrementScannedCount();
        
        return new Response(JSON.stringify({ success: true, violation: newViolation }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Invalid body format" }), { status: 400 });
      }
    }
    
    // --- Route 5: DELETE /api/violations/:id ---
    if (route.startsWith("/api/violations/") && method === "DELETE") {
      const parts = route.split("/");
      const idStr = parts[parts.length - 1];
      const id = parseInt(idStr, 10);
      
      // If it is not a direct numeric ID sub-route, let it fall through (e.g. bulk-delete is POST, not DELETE)
      if (!isNaN(id)) {
        let violations = getViolations();
        const initialLength = violations.length;
        violations = violations.filter(v => v.id !== id);
        saveViolations(violations);
        
        if (violations.length < initialLength) {
          return new Response(JSON.stringify({ success: true, id }), { status: 200 });
        } else {
          return new Response(JSON.stringify({ error: "Violation not found" }), { status: 404 });
        }
      }
    }
    
    // --- Route 6: POST /api/violations/bulk-delete ---
    if (route === "/api/violations/bulk-delete" && method === "POST") {
      try {
        let body = { ids: [] };
        if (init && init.body) {
          body = JSON.parse(init.body);
        }
        
        let violations = getViolations();
        const initialLength = violations.length;
        violations = violations.filter(v => !body.ids.includes(v.id));
        saveViolations(violations);
        
        const count = initialLength - violations.length;
        return new Response(JSON.stringify({ success: true, count }), { status: 200 });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Invalid body format" }), { status: 400 });
      }
    }
    
    // Fallback to original fetch for all other requests (e.g. assets)
    return originalFetch(input, init);
  };
}

// Function called by Canvas Simulation to log violation dynamically
export function triggerMockViolation(plate) {
  if (!window.isSimulationMode) return;
  
  const violations = getViolations();
  // Throttle duplicate violations
  const duplicate = violations.some(v => v.plate === plate && (Date.now() - new Date(v.timestamp).getTime()) < 30000);
  if (duplicate) return;
  
  const newViolation = {
    id: Date.now() + Math.floor(Math.random() * 100),
    plate: plate,
    timestamp: new Date().toISOString(),
    compliant: false,
    vehicle_details: generateRandomVehicleDetails(plate)
  };
  
  violations.push(newViolation);
  saveViolations(violations);
  
  // Dispatch event so React components can update immediately
  window.dispatchEvent(new CustomEvent("new-violation-detected", { detail: newViolation }));
}

export function triggerMockScanned() {
  if (!window.isSimulationMode) return;
  incrementScannedCount();
}
