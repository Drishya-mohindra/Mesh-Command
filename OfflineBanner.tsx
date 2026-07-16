import { AnimatePresence, motion } from "framer-motion";

// Shown whenever the socket is disconnected. The danger this guards against: a
// user drifts to the edge of the AP's range, the connection drops, and they
// submit a "medical, high urgency" request that silently never reaches anyone.
// Paired with disabled submit buttons on every page that writes, so it's always
// "it sent" or "you clearly know it didn't" — never a silent queue.
export default function OfflineBanner({ connected }: { connected: boolean }) {
  return (
    <AnimatePresence>
      {!connected && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          role="alert"
          className="sticky top-[57px] z-20 overflow-hidden bg-red-500/15 text-red-300"
        >
          <div className="flex items-center justify-center gap-2 px-4 py-2 text-center text-xs font-medium">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
            Not connected — move closer to the access point. Your messages aren't being sent.
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
