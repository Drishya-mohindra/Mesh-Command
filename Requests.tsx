import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../lib/api";
import { getSession } from "../lib/session";
import { useSocket } from "../hooks/useSocket";
import RequestTicket from "../components/RequestTicket";
import OfflineBanner from "../components/OfflineBanner";
import { useToast } from "../components/Toast";

interface ResourceRequest {
  id: number;
  author: string;
  category: string;
  note: string;
  urgency: string;
  status: "new" | "acknowledged" | "resolved";
  created_at: number;
}

const CATEGORIES = ["medical", "water", "food", "shelter", "other"];
const URGENCIES = ["low", "medium", "high"];
const COLUMNS: { key: ResourceRequest["status"]; label: string }[] = [
  { key: "new", label: "New" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "resolved", label: "Resolved" },
];

export default function Requests() {
  const [requests, setRequests] = useState<ResourceRequest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState("medical");
  const [urgency, setUrgency] = useState("medium");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { socket, connected } = useSocket();
  const toast = useToast();
  const session = getSession();

  useEffect(() => {
    api.getRequests().then(setRequests).catch(() => toast("Couldn't load requests.", "error"));
  }, []);

  useEffect(() => {
    function onNew(r: ResourceRequest) {
      setRequests((prev) => [r, ...prev]);
    }
    function onUpdate(updated: ResourceRequest) {
      setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    }
    socket.on("request:new", onNew);
    socket.on("request:update", onUpdate);
    return () => {
      socket.off("request:new", onNew);
      socket.off("request:update", onUpdate);
    };
  }, [socket]);

  const grouped = useMemo(() => {
    const map: Record<string, ResourceRequest[]> = { new: [], acknowledged: [], resolved: [] };
    for (const r of requests) map[r.status]?.push(r);
    return map;
  }, [requests]);

  async function submit() {
    if (!session) return;
    if (!connected) {
      toast("Not connected — move closer to the access point.", "error");
      return;
    }
    setSubmitting(true);
    try {
      await api.postRequest(session.nickname, category, note.trim(), urgency);
      setNote("");
      setShowForm(false);
      toast("Request sent — responders can see it now.", "success");
    } catch (e: any) {
      toast(e.message || "Couldn't send request.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function advance(r: ResourceRequest) {
    if (!connected) {
      toast("Not connected — move closer to the access point.", "error");
      return;
    }
    const next = r.status === "new" ? "acknowledged" : "resolved";
    try {
      await api.updateRequestStatus(r.id, next);
    } catch {
      toast("Couldn't update status.", "error");
    }
  }

  return (
    <div className="min-h-screen bg-base pb-28">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/5 bg-base/95 px-4 py-4 backdrop-blur">
        <h1 className="text-lg font-semibold">Resource Requests</h1>
        <button
          onClick={() => setShowForm(true)}
          disabled={!connected}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-base disabled:opacity-40"
        >
          + New
        </button>
      </header>

      <OfflineBanner connected={connected} />

      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-3">
        {COLUMNS.map((col) => (
          <div key={col.key} className="rounded-xl2 bg-surface p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {col.label}
              </h3>
              <span className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] text-zinc-400">
                {grouped[col.key]?.length || 0}
              </span>
            </div>
            <div className="space-y-2">
              <AnimatePresence>
                {grouped[col.key]?.length === 0 && (
                  <p className="py-6 text-center text-xs text-zinc-600">Nothing here</p>
                )}
                {grouped[col.key]?.map((r) => (
                  <RequestTicket key={r.id} {...r} onAdvance={() => advance(r)} />
                ))}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end bg-black/60 sm:items-center sm:justify-center"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", duration: 0.4 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-3xl bg-surface p-5 sm:rounded-3xl"
            >
              <h2 className="mb-4 text-lg font-semibold">Request a resource</h2>

              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Category</label>
              <div className="mb-4 flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize ${
                      category === c ? "bg-accent text-base" : "bg-surface2 text-zinc-300"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>

              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Urgency</label>
              <div className="mb-4 flex gap-2">
                {URGENCIES.map((u) => (
                  <button
                    key={u}
                    onClick={() => setUrgency(u)}
                    className={`flex-1 rounded-xl py-2 text-xs font-medium capitalize ${
                      urgency === u ? "bg-accent text-base" : "bg-surface2 text-zinc-300"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>

              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Details (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Family of 4, block C, need water by tonight"
                maxLength={300}
                rows={3}
                className="mb-4 w-full resize-none rounded-xl2 border border-white/10 bg-surface2 px-4 py-3 text-sm outline-none focus:border-accent"
              />

              <button
                onClick={submit}
                disabled={submitting || !connected}
                className="w-full rounded-xl2 bg-accent py-3.5 font-semibold text-base disabled:opacity-40"
              >
                {!connected ? "Not connected" : submitting ? "Sending…" : "Send request"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
