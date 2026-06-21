import { useState, useEffect, useRef } from "react";
import { API_BASE_URL } from "../config";
import { triggerMockViolation, triggerMockScanned } from "../mockBackend";

export default function StreamView() {
  const [status, setStatus] = useState("connecting"); // connecting | live | error
  const [ocrReady, setOcrReady] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [isSimMode, setIsSimMode] = useState(window.isStreamSimulated || window.isSimulationMode);
  const [counts, setCounts] = useState({ compliant: 0, violations: 0 });

  const imgRef = useRef(null);
  const canvasRef = useRef(null);

  // Sync mode state and listen to mode change event
  useEffect(() => {
    const handleModeChange = (e) => {
      if (e.detail?.simulation) {
        setIsSimMode(true);
        setStatus("live");
      }
    };
    window.addEventListener("api-mode-change", handleModeChange);
    return () => window.removeEventListener("api-mode-change", handleModeChange);
  }, []);

  // Poll stats for live badge counts
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/stats`);
        if (!res.ok) return;
        const data = await res.json();
        setOcrReady(data.ocr_ready ?? false);
        setOcrLoading(data.ocr_loading ?? false);
        setCounts({
          compliant: data.vehicles_scanned - data.violations,
          violations: data.violations,
        });
      } catch (err) {
        // Fallback count updates in simulation mode handled by custom event
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, []);

  // Sync compliance counts from local events in simulation mode
  useEffect(() => {
    if (!isSimMode) return;
    const handleNewViolation = () => {
      // Re-fetch stats from intercepted mock endpoint
      fetch(`${API_BASE_URL}/api/stats`)
        .then((res) => res.json())
        .then((data) => {
          setCounts({
            compliant: data.vehicles_scanned - data.violations,
            violations: data.violations,
          });
        });
    };
    window.addEventListener("new-violation-detected", handleNewViolation);
    return () => window.removeEventListener("new-violation-detected", handleNewViolation);
  }, [isSimMode]);

  // Canvas Simulation Engine
  useEffect(() => {
    if (!isSimMode || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let animationId;

    // Simulation configuration
    const W = 1280;
    const H = 720;
    canvas.width = W;
    canvas.height = H;

    const horizon = H * 0.5;
    let roadOffset = 0;
    let frameIdx = 0;

    const CAR_COLORS = [
      "rgb(130, 70, 50)",
      "rgb(50, 130, 70)",
      "rgb(50, 70, 130)",
      "rgb(100, 80, 30)",
      "rgb(60, 60, 60)",
      "rgb(140, 50, 90)",
      "rgb(30, 110, 110)",
      "rgb(80, 30, 120)",
    ];

    const RJ_DISTRICTS = ["14", "20", "06", "45", "01", "27", "11"];
    const ALPHA = "ABCDEFGHJKLMNPRSTUVWXYZ";

    function randPlate() {
      const dist = RJ_DISTRICTS[Math.floor(Math.random() * RJ_DISTRICTS.length)];
      const series = ALPHA[Math.floor(Math.random() * ALPHA.length)] + ALPHA[Math.floor(Math.random() * ALPHA.length)];
      const num = Math.floor(Math.random() * 9000) + 1000;
      return `RJ${dist} ${series} ${num}`;
    }

    // Spawn initial vehicles
    const vehicles = [];
    const laneY = (lane) => horizon + 40 + lane * ((H - horizon - 70) / 3);

    for (let i = 0; i < 6; i++) {
      const lane = i % 3;
      vehicles.push({
        x: Math.random() * (W + 400) - 400,
        y: laneY(lane),
        w: Math.floor(Math.random() * 50) + 155,
        h: 68,
        speed: Math.random() * 2.4 + 1.6,
        color: CAR_COLORS[i % CAR_COLORS.length],
        compliant: Math.random() > 0.35,
        plate: randPlate(),
        crossedTriggerLine: false,
      });
    }

    // Draw AprilTag symbol
    function drawAprilTag(c, cx, cy, size = 24) {
      const h = size / 2;
      c.fillStyle = "#FFFFFF";
      c.fillRect(cx - h, cy - h, size, size);
      
      const i = size / 3;
      c.fillStyle = "#000000";
      c.fillRect(cx - i, cy - i, i * 2, i * 2);
      
      const d = size / 7;
      c.fillStyle = "#FFFFFF";
      c.fillRect(cx - d, cy - d, d * 2, d * 2);

      // Add corner marker blocks
      c.fillStyle = "#FFFFFF";
      c.fillRect(cx - h, cy - h, 6, 6);
      c.fillRect(cx + h - 6, cy - h, 6, 6);
      c.fillRect(cx - h, cy + h - 6, 6, 6);
      c.fillRect(cx + h - 6, cy + h - 6, 6, 6);
    }

    // Render loop
    function render() {
      // 1. Sky Gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon);
      skyGrad.addColorStop(0, "rgb(95, 85, 55)");
      skyGrad.addColorStop(1, "rgb(150, 133, 83)");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, horizon);

      // 2. Road Surface
      ctx.fillStyle = "rgb(38, 40, 42)";
      ctx.fillRect(0, horizon, W, H - horizon);

      // Road edge line
      ctx.strokeStyle = "rgb(70, 70, 70)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      ctx.lineTo(W, horizon);
      ctx.stroke();

      // Lane dividers
      const usableHeight = H - horizon;
      ctx.strokeStyle = "rgb(75, 75, 75)";
      ctx.lineWidth = 1;
      for (let lane = 1; lane < 3; lane++) {
        const ly = horizon + lane * (usableHeight / 3);
        ctx.beginPath();
        ctx.moveTo(0, ly);
        ctx.lineTo(W, ly);
        ctx.stroke();
      }

      // Scrolling dashed lane lines
      const period = 100;
      const off = roadOffset % period;
      const midY = horizon + usableHeight / 2;
      ctx.fillStyle = "rgb(185, 185, 185)";
      for (let sx = -period + off; sx < W + period; sx += period) {
        const x1 = Math.max(0, sx);
        const x2 = Math.min(W, sx + 58);
        if (x1 < x2) {
          ctx.fillRect(x1, midY - 2, x2 - x1, 4);
        }
      }

      // 3. Background Skyline
      for (let i = 0; i < 12; i++) {
        const bx = ((i * 160 - frameIdx * 0.25) % (W + 300)) - 150;
        const bh = 55 + ((i * 29) % 90);
        const bw = 55 + ((i * 19) % 55);
        const by = horizon - bh;
        const shade = 52 + ((i * 11) % 28);
        
        ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade + 10})`;
        ctx.fillRect(bx, by, bw, bh);

        // Lit Windows
        for (let wy = by + 7; wy < horizon - 8; wy += 15) {
          for (let wx = bx + 7; wx < bx + bw - 7; wx += 13) {
            const lit = ((Math.floor(frameIdx / 25) + i + wy) % 6) !== 0;
            ctx.fillStyle = lit ? "rgb(195, 215, 250)" : "rgb(28, 28, 38)";
            ctx.fillRect(wx, wy, 6, 8);
          }
        }
      }

      // 4. Draw Vehicles sorted back-to-front
      const sortedVehicles = [...vehicles].sort((a, b) => a.y - b.y);
      
      sortedVehicles.forEach((v) => {
        const x = Math.floor(v.x);
        const y = v.y;
        const w = v.w;
        const h = v.h;
        const bc = v.color;

        // Roof / Cabin
        ctx.fillStyle = bc.replace("rgb", "rgba").replace(")", ", 0.85)");
        ctx.fillRect(x + w / 5, y - h / 2, w - (w / 5) * 2, h / 2 + 5);

        // Windshield Glass
        ctx.fillStyle = "rgb(160, 195, 215)";
        ctx.fillRect(x + w / 5 + 5, y - h / 2 + 5, w - (w / 5) * 2 - 10, h / 2 - 2);

        // Body
        ctx.fillStyle = bc;
        ctx.fillRect(x, y, w, h);

        // Wheels
        ctx.fillStyle = "rgb(15, 15, 15)";
        [x + 30, x + w - 30].forEach((wx) => {
          ctx.beginPath();
          ctx.arc(wx, y + h + 7, 14, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.fillStyle = "rgb(55, 55, 55)";
          ctx.beginPath();
          ctx.arc(wx, y + h + 7, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgb(15, 15, 15)";
        });

        // Tail-lights
        ctx.fillStyle = "rgb(20, 20, 160)";
        ctx.fillRect(x - 6, y + 10, 6, 16);
        ctx.fillStyle = "rgb(30, 80, 220)";
        ctx.fillRect(x + w, y + 10, 6, 16);

        // Compliance details and license plate
        let boxCol = "rgb(55, 195, 75)";
        let label = "SEATBELT DETECTED";

        if (v.compliant) {
          drawAprilTag(ctx, x + w / 2, y + h / 2);
        } else {
          boxCol = "rgb(215, 45, 45)";
          label = `VIOLATION  ${v.plate}`;

          // Draw Plate
          ctx.font = "bold 11px sans-serif";
          const textWidth = ctx.measureText(v.plate).width;
          const px = x + (w - textWidth) / 2;
          const py = y + h - 5;
          
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(px - 4, py - 12, textWidth + 8, 16);
          ctx.strokeStyle = "rgb(180, 180, 180)";
          ctx.lineWidth = 1;
          ctx.strokeRect(px - 4, py - 12, textWidth + 8, 16);
          
          ctx.fillStyle = "#101010";
          ctx.fillText(v.plate, px, py);
        }

        // Bounding Box
        ctx.strokeStyle = boxCol;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 3, y - h / 2 - 5, w + 6, h + h / 2 + 27);

        // Label Badge
        ctx.fillStyle = boxCol;
        ctx.font = "bold 10px sans-serif";
        const badgeWidth = ctx.measureText(label).width;
        ctx.fillRect(x - 3, y - h / 2 - 20, badgeWidth + 10, 15);
        
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(label, x + 2, y - h / 2 - 9);
      });

      // 5. HUD Overlay
      ctx.fillStyle = "rgb(235, 235, 235)";
      ctx.font = "14px monospace";
      const ts = new Date().toISOString().replace("T", "  ").substring(0, 20);
      ctx.fillText(`SafeBelt AI  |  CLOUD DEMO  |  ${ts}`, 12, 30);
      
      ctx.fillStyle = "rgb(80, 210, 175)";
      ctx.font = "12px sans-serif";
      ctx.fillText("Jaipur Highway Monitoring — Cloud Simulation Mode", 12, 54);

      // 6. Physics / Movement updates
      vehicles.forEach((v) => {
        v.x += v.speed;
        
        // Trigger Line crossing (center of viewport)
        if (v.x > W / 2 - 50 && !v.crossedTriggerLine) {
          v.crossedTriggerLine = true;
          triggerMockScanned();
          
          if (!v.compliant) {
            window.mockLiveState = { compliant: false, plate: v.plate };
            triggerMockViolation(v.plate);
          } else {
            window.mockLiveState = { compliant: true, plate: null };
          }
        }

        // Recycle vehicles going off screen
        if (v.x > W + 70) {
          v.x = -Math.floor(Math.random() * 220) - 60;
          v.compliant = Math.random() > 0.40;
          v.plate = randPlate();
          v.crossedTriggerLine = false;
        }
      });

      roadOffset += 3;
      frameIdx += 1;
      animationId = requestAnimationFrame(render);
    }

    setStatus("live");
    render();

    return () => cancelAnimationFrame(animationId);
  }, [isSimMode]);

  // Track stream img load/error
  const handleLoad = () => setStatus("live");
  const handleError = () => setStatus("error");

  return (
    <div
      className="relative w-full rounded-card overflow-hidden border border-hairline bg-ink"
      style={{ aspectRatio: "16/9" }}
    >
      {/* Simulation Canvas (only active when offline) */}
      {isSimMode ? (
        <canvas ref={canvasRef} className="w-full h-full object-cover" />
      ) : (
        /* MJPEG stream */
        <img
          ref={imgRef}
          id="stream-img"
          src={`${API_BASE_URL}/api/stream`}
          alt="Live seatbelt detection stream"
          className="w-full h-full object-cover"
          onLoad={handleLoad}
          onError={handleError}
        />
      )}

      {/* Connecting overlay */}
      {status === "connecting" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/80 text-white gap-3">
          <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <p className="font-body text-sm text-white/70">Connecting to stream…</p>
        </div>
      )}

      {/* Error overlay */}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/90 text-white gap-3">
          <svg className="w-10 h-10 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
          <p className="font-body text-sm text-white/70">Stream unavailable — start the backend</p>
          <button
            onClick={() => {
              setStatus("connecting");
              if (imgRef.current) imgRef.current.src = `${API_BASE_URL}/api/stream?` + Date.now();
            }}
            className="btn-secondary text-white border-white/40 text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {/* Live badge top-left */}
      {status === "live" && (
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <span className="flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-error" />
          </span>
          <span className="badge badge-error backdrop-blur-sm bg-white/90">
            {isSimMode ? "SIMULATED" : "LIVE"}
          </span>
        </div>
      )}

      {/* Count badges top-right */}
      {status === "live" && (
        <div className="absolute top-4 right-4 flex gap-2">
          <span id="badge-compliant" className="badge badge-success backdrop-blur-sm bg-white/90">
            ✓ {counts.compliant} Compliant
          </span>
          <span id="badge-violation" className="badge badge-error backdrop-blur-sm bg-white/90">
            ✗ {counts.violations} Violations
          </span>
        </div>
      )}

      {/* OCR loading banner — only shown while actively loading */}
      {ocrLoading && !ocrReady && status === "live" && !isSimMode && (
        <div
          className="absolute bottom-0 left-0 right-0 bg-amber-600/92 backdrop-blur-sm px-4 py-2.5
                        flex items-center gap-2.5"
        >
          <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin shrink-0" />
          <p className="font-body text-xs text-white font-medium tracking-wide">
            Initializing OCR engine — plate recognition will begin shortly
          </p>
        </div>
      )}
    </div>
  );
}
