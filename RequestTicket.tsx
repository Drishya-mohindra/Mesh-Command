import { motion } from "framer-motion";

const URGENCY: Record<string, { color: string; label: string }> = {
  high: { color: "bg-urgentHigh", label: "High" },
  medium: { color: "bg-urgentMed", label: "Medium" },
  low: { color: "bg-urgentLow", label: "Low" },
};

const CATEGORY_ICON: Record<string, string> = {
  medical: "🩺",
  water: "💧",
  food: "🍚",
  shelter: "⛺",
  other: "📦",
};

export default function RequestTicket({
  category,
  note,
  urgency,
  author,
  status,
  onAdvance,
}: {
  category: string;
  note: string;
  urgency: string;
  author: string;
  status: string;
  onAdvance?: () => void;
}) {
  const u = URGENCY[urgency] || URGENCY.medium;

  return (
    <motion.div
      layout
      layoutId={`ticket-${author}-${category}-${note}`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", duration: 0.35 }}
      className="rounded-xl2 border border-white/5 bg-surface2 p-3"
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium capitalize">
          <span>{CATEGORY_ICON[category] || "📦"}</span> {category}
        </span>
        <span className={`h-2 w-2 rounded-full ${u.color}`} title={`${u.label} urgency`} />
      </div>
      {note && <p className="mb-2 text-xs text-zinc-400">{note}</p>}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-zinc-500">{author}</span>
        {status !== "resolved" && onAdvance && (
          <button
            onClick={onAdvance}
            className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent"
          >
            {status === "new" ? "Acknowledge" : "Resolve"}
          </button>
        )}
      </div>
    </motion.div>
  );
}
