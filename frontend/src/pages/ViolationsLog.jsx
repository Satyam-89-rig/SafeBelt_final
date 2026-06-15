import { useEffect, useState, useCallback } from "react";
import ViolationRow from "../components/ViolationRow";

const PAGE_SIZE = 15;

export default function ViolationsLog() {
  const [items,    setItems]    = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(true);
  const [dateFilter, setDate]   = useState("");
  const [locFilter,  setLoc]    = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const fetchViolations = useCallback(async (p = 1) => {
    setLoading(true);
    setSelectedIds(new Set());
    setShowBulkDeleteConfirm(false);
    try {
      const params = new URLSearchParams({ page: p, page_size: PAGE_SIZE });
      if (dateFilter) params.append("date",     dateFilter);
      if (locFilter)  params.append("location", locFilter);

      const res = await fetch(`/api/violations?${params}`);
      if (!res.ok) throw new Error("Network error");
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setPage(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, locFilter]);

  const handleToggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const allIdsOnPage = items.map(item => item.id);
    const areAllSelected = allIdsOnPage.every(id => selectedIds.has(id));

    setSelectedIds(prev => {
      const next = new Set(prev);
      if (areAllSelected) {
        allIdsOnPage.forEach(id => next.delete(id));
      } else {
        allIdsOnPage.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleDeleteSingle = async (id) => {
    try {
      const res = await fetch(`/api/violations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

      const isLastItemOnPage = items.length === 1;
      const targetPage = isLastItemOnPage && page > 1 ? page - 1 : page;
      await fetchViolations(targetPage);
    } catch (e) {
      console.error(e);
      alert("Failed to delete record");
    }
  };

  const handleBulkDelete = async () => {
    try {
      const idsArray = Array.from(selectedIds);
      const res = await fetch("/api/violations/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsArray }),
      });
      if (!res.ok) throw new Error("Bulk delete failed");
      
      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);

      const numDeletedOnCurrentPage = items.filter(item => selectedIds.has(item.id)).length;
      const isCurrentPageFullyDeleted = numDeletedOnCurrentPage === items.length;
      const targetPage = isCurrentPageFullyDeleted && page > 1 ? page - 1 : page;
      await fetchViolations(targetPage);
    } catch (e) {
      console.error(e);
      alert("Failed to delete selected records");
    }
  };

  useEffect(() => { fetchViolations(1); }, [fetchViolations]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="relative overflow-hidden">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative pt-20 pb-10 px-6 md:px-12 overflow-hidden">
        <div className="orb w-72 h-72 bg-peach" style={{ top: "-50px", right: "5%" }} />
        <div className="relative z-10 max-w-4xl mx-auto">
          <span className="badge badge-error mb-4 inline-flex">VIOLATION LOG</span>
          <h1 className="display text-5xl md:text-6xl text-ink mb-3 leading-tight">
            Recorded Violations
          </h1>
          <p className="font-body text-stone-400 text-lg">
            {total} violation{total !== 1 ? "s" : ""} on record
          </p>
        </div>
      </section>

      {/* ── Filters ──────────────────────────────────────────────────── */}
      <section className="px-6 md:px-12 pb-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              id="date-filter"
              type="date"
              value={dateFilter}
              onChange={e => setDate(e.target.value)}
              className="flex-1 font-body text-sm border border-hairline rounded-pill px-4 py-2.5 bg-surface
                         text-ink focus:outline-none focus:border-ink/30 transition-colors"
            />
            <input
              id="location-filter"
              type="text"
              placeholder="Filter by location…"
              value={locFilter}
              onChange={e => setLoc(e.target.value)}
              className="flex-1 font-body text-sm border border-hairline rounded-pill px-4 py-2.5 bg-surface
                         text-ink placeholder:text-stone-300 focus:outline-none focus:border-ink/30 transition-colors"
            />
            <button
              id="filter-reset"
              onClick={() => { setDate(""); setLoc(""); }}
              className="btn-secondary text-sm whitespace-nowrap"
            >
              Reset
            </button>
          </div>
        </div>
      </section>

      {/* ── Table ────────────────────────────────────────────────────── */}
      <section className="px-6 md:px-12 pb-24">
        <div className="max-w-4xl mx-auto bg-surface rounded-card border border-hairline px-6 pt-2 pb-4">
          {loading ? (
            <div className="py-20 flex flex-col items-center gap-3 text-stone-300">
              <div className="w-8 h-8 border-2 border-stone-200 border-t-stone-400 rounded-full animate-spin"/>
              <p className="font-body text-sm">Loading violations…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="py-20 flex flex-col items-center gap-3 text-stone-300">
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <p className="font-body text-sm">No violations found for the selected filters.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 py-3 px-4 bg-stone-50/70 border-b border-hairline -mx-6 px-6 mb-2 rounded-t-card">
                <input
                  type="checkbox"
                  checked={items.length > 0 && items.every(item => selectedIds.has(item.id))}
                  onChange={handleSelectAll}
                  className="w-4 h-4 rounded border-hairline text-ink bg-canvas focus:ring-0 focus:ring-offset-0 cursor-pointer accent-stone-850"
                />
                <span className="font-body text-xs font-semibold text-stone-400 uppercase tracking-widest">
                  Select All
                </span>
              </div>
              {items.map((v, i) => (
                <ViolationRow
                  key={v.id}
                  violation={v}
                  index={i}
                  selected={selectedIds.has(v.id)}
                  onToggleSelect={() => handleToggleSelect(v.id)}
                  onDelete={handleDeleteSingle}
                />
              ))}
            </>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="max-w-4xl mx-auto flex items-center justify-between mt-6">
            <span className="font-body text-sm text-stone-400">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                id="page-prev"
                disabled={page <= 1}
                onClick={() => fetchViolations(page - 1)}
                className="btn-secondary text-sm disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              <button
                id="page-next"
                disabled={page >= totalPages}
                onClick={() => fetchViolations(page + 1)}
                className="btn-secondary text-sm disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── Floating Bulk Action Bar ──────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-md px-4 fade-up">
          <div className="bg-stone-900/95 text-white rounded-pill px-5 py-3.5 flex items-center justify-between shadow-2xl border border-white/10 backdrop-blur-md">
            <span className="font-body text-sm font-medium pl-1">
              {selectedIds.size} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setSelectedIds(new Set()); setShowBulkDeleteConfirm(false); }}
                className="font-body text-xs text-stone-400 hover:text-white transition-colors py-2 px-3"
              >
                Clear
              </button>
              {showBulkDeleteConfirm ? (
                <div className="flex items-center gap-1.5 fade-up">
                  <button
                    onClick={handleBulkDelete}
                    className="bg-error hover:opacity-90 text-white font-body font-semibold text-xs py-1.5 px-3.5 rounded-pill transition-opacity"
                  >
                    Confirm?
                  </button>
                  <button
                    onClick={() => setShowBulkDeleteConfirm(false)}
                    className="bg-white/10 hover:bg-white/20 text-white font-body font-semibold text-xs py-1.5 px-3.5 rounded-pill transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="bg-error hover:opacity-90 text-white font-body font-semibold text-xs py-1.5 px-3.5 rounded-pill transition-opacity"
                >
                  Delete Selected
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
