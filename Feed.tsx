import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../lib/api";
import { getSession } from "../lib/session";
import { useSocket } from "../hooks/useSocket";
import BroadcastCard from "../components/BroadcastCard";
import LiveCounter from "../components/LiveCounter";
import OfflineBanner from "../components/OfflineBanner";
import { useToast } from "../components/Toast";

interface Broadcast {
  id: number;
  author: string;
  role: string;
  message: string;
  created_at: number;
}

export default function Feed() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const { socket, deviceCount, connected } = useSocket();
  const toast = useToast();
  const session = getSession();

  useEffect(() => {
    api
      .getBroadcasts()
      .then(setBroadcasts)
      .catch(() => toast("Couldn't load the feed. Retrying on reconnect.", "error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function onNew(b: Broadcast) {
      setBroadcasts((prev) => [b, ...prev]);
    }
    socket.on("broadcast:new", onNew);
    return () => {
      socket.off("broadcast:new", onNew);
    };
  }, [socket]);

  async function send() {
    if (!draft.trim() || !session) return;
    if (!connected) {
      toast("Not connected — move closer to the access point.", "error");
      return;
    }
    setSending(true);
    try {
      await api.postBroadcast(session.nickname, session.role, draft.trim());
      setDraft("");
      toast("Broadcast sent to everyone nearby.", "success");
    } catch (e: any) {
      toast(e.message || "Message failed to send.", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-base pb-28">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/5 bg-base/95 px-4 py-4 backdrop-blur">
        <h1 className="text-lg font-semibold">Broadcast Feed</h1>
        <LiveCounter count={deviceCount} connected={connected} />
      </header>

      <OfflineBanner connected={connected} />

      <div className="space-y-3 px-4 py-4">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl2 bg-surface" />
            ))}
          </div>
        )}

        {!loading && broadcasts.length === 0 && (
          <div className="mt-10 text-center text-zinc-500">
            <div className="mb-2 text-3xl">📭</div>
            No broadcasts yet. Be the first to post an update.
          </div>
        )}

        <AnimatePresence initial={false}>
          {broadcasts.map((b) => (
            <BroadcastCard key={b.id} {...b} />
          ))}
        </AnimatePresence>
      </div>

      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed bottom-16 left-0 right-0 z-30 border-t border-white/5 bg-surface/95 px-4 py-3 backdrop-blur"
      >
        <div className="mx-auto flex max-w-md gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={connected ? "Post an update everyone can see…" : "Reconnecting…"}
            maxLength={500}
            disabled={!connected}
            className="flex-1 rounded-xl2 border border-white/10 bg-surface2 px-4 py-2.5 text-sm outline-none focus:border-accent disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={sending || !draft.trim() || !connected}
            className="rounded-xl2 bg-accent px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </motion.div>
    </div>
  );
}
