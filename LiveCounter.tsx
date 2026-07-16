import { motion, AnimatePresence } from "framer-motion";

export default function LiveCounter({ count, connected }: { count: number; connected: boolean }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-surface2 px-3 py-1.5 text-xs font-medium">
      <span
        className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-zinc-600"}`}
      />
      <AnimatePresence mode="popLayout">
        <motion.span
          key={count}
          initial={{ y: -6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 6, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {count}
        </motion.span>
      </AnimatePresence>
      <span className="text-zinc-500">online</span>
    </div>
  );
}
