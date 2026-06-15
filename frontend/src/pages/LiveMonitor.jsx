import { useEffect, useState, useRef, useCallback } from "react";
import StreamView from "../components/StreamView";
import PlateScanModal from "../components/PlateScanModal";

export default function LiveMonitor() {
  const [stats, setStats] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Cooldown ref — prevents modal re-opening for 30 s after dismiss
  const cooldownUntil = useRef(0);
  // Track last non-compliant state to detect a fresh violation trigger
  const wasCompliant = useRef(true);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/stats");
        if (res.ok) {
          const data = await res.json();
          setStats(data);

          const liveCompliant = data?.live?.compliant ?? true;

          // Show modal on rising edge: compliant → violation, if cooldown passed
          if (!liveCompliant && wasCompliant.current && Date.now() > cooldownUntil.current) {
            setShowModal(true);
          }
          wasCompliant.current = liveCompliant;
        }
      } catch { /* backend warming up */ }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, []);

  const handleModalClose = useCallback((_plate) => {
    setShowModal(false);
    // 30-second cooldown so the modal doesn't spam on every violation cycle
    cooldownUntil.current = Date.now() + 30_000;
  }, []);

  const compliant   = stats ? stats.vehicles_scanned - stats.violations : 0;
  const violations  = stats ? stats.violations : 0;
  const rate        = stats ? stats.compliance_rate : null;
  const isCompliant = stats?.live?.compliant ?? true;

  return (
    <div className="relative overflow-hidden min-h-screen">
      {/* ── Plate Scan Modal ──────────────────────────────────────────── */}
      {showModal && (
        <PlateScanModal onClose={handleModalClose} />
      )}

      {/* Grid background mesh overlay */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #000 1px, transparent 0)`,
          backgroundSize: '24px 24px'
        }}
      />

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="relative pt-20 pb-12 px-6 md:px-12 text-center overflow-hidden">
        {/* Colorful ambient background orbs */}
        <div
          className="orb w-96 h-96 bg-lavender"
          style={{ top: "-80px", left: "20%", transform: "translateX(-50%)", opacity: 0.3 }}
        />
        <div
          className="orb w-[450px] h-[450px] bg-mint"
          style={{ top: "-120px", right: "20%", transform: "translateX(50%)", opacity: 0.35 }}
        />

        <div className="relative z-10 max-w-3xl mx-auto">
          {/* Live status pill */}
          <div className="inline-flex items-center gap-2 mb-5 bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-pill border border-hairline shadow-sm">
            <span className={`w-2 h-2 rounded-full pulse-ring ${isCompliant ? "bg-success" : "bg-error"}`} />
            <span className={`badge text-[9px] font-bold tracking-widest ${isCompliant ? "text-success" : "text-error"}`}>
              {isCompliant ? "ALL COMPLIANT" : "VIOLATION DETECTED"}
            </span>
          </div>

          <h1 className="font-display text-4xl md:text-6xl text-ink mb-4 leading-tight tracking-tight font-light">
            Seatbelt Compliance <span className="bg-clip-text text-transparent bg-gradient-to-r from-stone-850 via-stone-700 to-stone-500 font-normal">Monitor</span>
          </h1>
          <p className="font-body text-stone-400 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
            Protecting drivers with automated detection. A multi-stage AI system powered by 
            <span className="text-stone-700 font-semibold"> YOLOv8 object detection</span>, 
            <span className="text-stone-700 font-semibold"> AprilTag marker localization</span>, and 
            <span className="text-stone-700 font-semibold"> EasyOCR identification</span>.
          </p>
        </div>
      </section>

      {/* ── Dashboard Grid ─────────────────────────────────────────── */}
      <section className="relative z-10 px-6 md:px-12 pb-16">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          
          {/* Left Column: StreamView & Compliance Rate (Span 2) */}
          <div className="md:col-span-2 flex flex-col gap-6">
            <div className="bg-white p-2 rounded-card border border-hairline shadow-card hover:shadow-card-hover transition-all duration-300">
              <StreamView />
            </div>

            {/* Compliance rate bar card */}
            {rate !== null && (
              <div className="bg-white rounded-card border border-hairline p-5 shadow-card hover:shadow-card-hover transition-all duration-300">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="caption-upper text-stone-400 text-[10px]">Compliance Performance</span>
                    <h4 className="font-display text-sm text-stone-500 font-light">Target rate: 95.0%</h4>
                  </div>
                  <span className={`font-display text-3xl font-light ${
                    rate >= 80 ? "text-success" : rate >= 50 ? "text-amber-600" : "text-error"
                  }`}>
                    {rate}%
                  </span>
                </div>
                <div className="w-full h-2 bg-canvas rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      rate >= 80 ? "bg-success" : rate >= 50 ? "bg-amber-500" : "bg-error"
                    }`}
                    style={{ width: `${rate}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Telemetry Stats & Status Indicators */}
          <div className="flex flex-col gap-6">
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 gap-4">
              {/* Scanned */}
              <div className="card group cursor-default relative overflow-hidden bg-white hover:border-ink/20 transition-all duration-300">
                <div className="flex items-start justify-between mb-2">
                  <span className="caption-upper text-stone-400 text-[10px]">Vehicles Scanned</span>
                  <span className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 group-hover:bg-ink group-hover:text-white transition-colors duration-300">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>
                  </span>
                </div>
                <p className="font-display text-4xl text-ink font-light leading-none mb-1">{stats?.vehicles_scanned ?? "—"}</p>
                <p className="font-body text-[10px] text-stone-400">Total processed frames</p>
              </div>

              {/* Compliant */}
              <div className="card group cursor-default relative overflow-hidden bg-white hover:border-success/30 transition-all duration-300">
                <div className="flex items-start justify-between mb-2">
                  <span className="caption-upper text-stone-400 text-[10px]">Compliant</span>
                  <span className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center text-success group-hover:bg-success group-hover:text-white transition-colors duration-300">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </span>
                </div>
                <p className="font-display text-4xl text-success font-light leading-none mb-1">{compliant}</p>
                <p className="font-body text-[10px] text-stone-400">Safe seatbelt wearers</p>
              </div>

              {/* Violations */}
              <div className="card group cursor-default relative overflow-hidden bg-white hover:border-error/30 transition-all duration-300">
                <div className="flex items-start justify-between mb-2">
                  <span className="caption-upper text-stone-400 text-[10px]">Violations</span>
                  <span className="w-8 h-8 rounded-full bg-error/10 flex items-center justify-center text-error group-hover:bg-error group-hover:text-white transition-colors duration-300">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    </svg>
                  </span>
                </div>
                <p className="font-display text-4xl text-error font-light leading-none mb-1">{violations}</p>
                <p className="font-body text-[10px] text-stone-400">Non-compliant anomalies</p>
              </div>
            </div>

            {/* System Status Panel */}
            <div className="bg-white rounded-card border border-hairline p-5 shadow-card hover:shadow-card-hover transition-all duration-300 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-2 border-b border-hairline">
                <h3 className="font-display text-base text-ink font-semibold">Hardware Status</h3>
                <span className="badge bg-stone-100 text-stone-600 text-[9px] px-2 py-0.5 font-bold">ACTIVE</span>
              </div>

              <div className="grid grid-cols-2 gap-3.5 text-xs">
                <div className="bg-canvas/50 p-2.5 rounded-card flex flex-col gap-0.5">
                  <span className="text-[9px] text-stone-400 uppercase font-bold tracking-wider">Detector</span>
                  <span className="font-medium text-stone-700 truncate">YOLOv8n + Tag</span>
                </div>
                <div className="bg-canvas/50 p-2.5 rounded-card flex flex-col gap-0.5">
                  <span className="text-[9px] text-stone-400 uppercase font-bold tracking-wider">Location</span>
                  <span className="font-medium text-stone-700 truncate">{stats?.location ?? "Jaipur, RJ"}</span>
                </div>
                <div className="bg-canvas/50 p-2.5 rounded-card flex flex-col gap-0.5">
                  <span className="text-[9px] text-stone-400 uppercase font-bold tracking-wider">OCR Engine</span>
                  <span className="flex items-center gap-1.5 mt-0.5">
                    <span className={`w-2 h-2 rounded-full ${stats?.ocr_ready ? "bg-success animate-pulse" : stats?.ocr_loading ? "bg-amber-500 animate-spin" : "bg-stone-300"}`} />
                    <span className="font-medium text-stone-750">{stats?.ocr_ready ? "Ready" : stats?.ocr_loading ? "Loading..." : "Idle"}</span>
                  </span>
                </div>
                <div className="bg-canvas/50 p-2.5 rounded-card flex flex-col gap-0.5">
                  <span className="text-[9px] text-stone-400 uppercase font-bold tracking-wider">Live Frame</span>
                  <span className="font-medium text-stone-750 truncate font-mono text-[10px]">
                    {stats?.live?.plate ? stats.live.plate : "No plate"}
                  </span>
                </div>
              </div>

              <div className="pt-1">
                <button
                  onClick={() => setShowModal(true)}
                  className="w-full btn-primary text-xs py-2.5 px-4 text-center justify-center flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Simulate Manual Scan
                </button>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── Pipeline Features Section ─────────────────────────────────── */}
      <section className="relative z-10 px-6 md:px-12 pb-24">
        <div className="max-w-4xl mx-auto border-t border-hairline pt-16">
          <div className="text-center mb-12">
            <span className="badge badge-neutral mb-3">AI PIPELINE</span>
            <h2 className="font-display text-3xl md:text-4xl text-ink font-light">
              Multi-Stage Detection Pipeline
            </h2>
            <p className="font-body text-sm text-stone-400 max-w-md mx-auto mt-2">
              Combining high-accuracy object detection, geometric pose tracking, and character recognition for bulletproof enforcement.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: "YOLOv8 Detection",
                desc: "Real-time localization of passenger cabins and body coordinates. Runs in parallel to monitor driver posture and seatbelt alignment.",
                color: "bg-mint/10 border-mint/30 hover:border-mint/60",
                icon: (
                  <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4m5 0h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M12 5v14"/>
                  </svg>
                )
              },
              {
                title: "AprilTag Verification",
                desc: "Sub-millisecond validation of chest tag36h11 markers. Provides mathematical confirmation of seatbelt latch placement under all light conditions.",
                color: "bg-sky/10 border-sky/30 hover:border-sky/60",
                icon: (
                  <svg className="w-5 h-5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                  </svg>
                )
              },
              {
                title: "EasyOCR Reading",
                desc: "Non-blocking background extraction of license plate characters on compliance failure. Triggers Vahan Details API lookup for vehicle info.",
                color: "bg-peach/10 border-peach/30 hover:border-peach/60",
                icon: (
                  <svg className="w-5 h-5 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
                  </svg>
                )
              }
            ].map(({ title, desc, color, icon }) => (
              <div key={title} className={`card border ${color} hover:scale-[1.02] transition-all duration-300 flex flex-col gap-3 p-5`}>
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                  {icon}
                </div>
                <h3 className="font-display text-base text-ink font-semibold mt-1">{title}</h3>
                <p className="font-body text-xs text-stone-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
