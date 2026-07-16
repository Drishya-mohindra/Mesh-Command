import { motion } from "framer-motion";

const ROLE_BADGE: Record<string, string> = {
  coordinator: "bg-accent/20 text-accent",
  responder: "bg-amber-500/20 text-amber-400",
  civilian: "bg-zinc-500/20 text-zinc-300",
};

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export default function BroadcastCard({
  author,
  role,
  message,
  created_at,
}: {
  author: string;
  role: string;
  message: string;
  created_at: number;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", duration: 0.4 }}
      className="rounded-xl2 border border-white/5 bg-surface p-4"
    >
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium">{author}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${ROLE_BADGE[role] || ROLE_BADGE.civilian}`}>
            {role}
          </span>
        </div>
        <span className="text-xs text-zinc-500">{timeAgo(created_at)}</span>
      </div>
      <p className="text-sm text-zinc-200">{message}</p>
    </motion.div>
  );
}
