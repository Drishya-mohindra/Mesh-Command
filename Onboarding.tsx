import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { saveSession, Role } from "../lib/session";
import { useToast } from "../components/Toast";

const ROLES: { id: Role; label: string; desc: string; icon: string }[] = [
  { id: "civilian", label: "Civilian", desc: "Request help, see updates", icon: "🙋" },
  { id: "responder", label: "Responder", desc: "Acknowledge & resolve requests", icon: "🚑" },
  { id: "coordinator", label: "Coordinator", desc: "Broadcast alerts, manage the board", icon: "📡" },
];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [nickname, setNickname] = useState("");
  const [role, setRole] = useState<Role>("civilian");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  async function handleJoin() {
    if (!nickname.trim()) {
      toast("Enter a name so others can recognize you.", "error");
      return;
    }
    setLoading(true);
    try {
      const user = await api.join(nickname, role);
      saveSession({ id: user.id, nickname: user.nickname, role: user.role });
      if (user.renamedFrom) {
        // Someone nearby is already using the requested name — surface the
        // auto-disambiguation instead of silently creating a confusing duplicate.
        toast(`"${user.renamedFrom}" is already in use nearby — you're "${user.nickname}".`, "info");
      } else {
        toast(`Welcome aboard, ${user.nickname}.`, "success");
      }
      navigate("/feed");
    } catch (e: any) {
      toast(e.message || "Could not join. Try again.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-between bg-base px-6 pb-10 pt-16">
      <div>
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 text-center"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-3xl">
            🛰️
          </div>
          <h1 className="text-2xl font-semibold">Mesh Command Post</h1>
          <p className="mt-1 text-sm text-zinc-400">
            No internet. No towers. Just this network — and everyone on it.
          </p>
        </motion.div>

        {step === 0 && (
          <motion.div
            key="step-name"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <label className="block text-sm font-medium text-zinc-400">What should we call you?</label>
            {/*
              Do NOT use `text-base` here. The theme defines a COLOR named `base`
              (#0b0d12), so Tailwind emits `text-base` as both a font-size AND a
              text-color — on this dark input it paints the text near-black and
              invisible. (`bg-accent text-base` on the buttons is the intended
              dark-on-cyan use.) Font size still lands at 16px via inherit, which
              also keeps iOS from zooming on focus.
            */}
            <input
              autoFocus
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. Anita"
              maxLength={40}
              className="w-full rounded-xl2 border border-white/10 bg-surface px-4 py-3.5 text-white placeholder:text-zinc-500 outline-none focus:border-accent"
            />
            <button
              onClick={() => nickname.trim() && setStep(1)}
              className="w-full rounded-xl2 bg-accent py-3.5 font-semibold text-base disabled:opacity-40"
              disabled={!nickname.trim()}
            >
              Continue
            </button>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div
            key="step-role"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-3"
          >
            <label className="block text-sm font-medium text-zinc-400">What's your role here?</label>
            {ROLES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRole(r.id)}
                className={`flex w-full items-center gap-3 rounded-xl2 border px-4 py-3.5 text-left transition-colors ${
                  role === r.id ? "border-accent bg-accent/10" : "border-white/10 bg-surface"
                }`}
              >
                <span className="text-2xl">{r.icon}</span>
                <span>
                  <div className="font-medium">{r.label}</div>
                  <div className="text-xs text-zinc-500">{r.desc}</div>
                </span>
              </button>
            ))}
            <button
              onClick={handleJoin}
              disabled={loading}
              className="w-full rounded-xl2 bg-accent py-3.5 font-semibold text-base disabled:opacity-40"
            >
              {loading ? "Joining…" : "Join the network"}
            </button>
          </motion.div>
        )}
      </div>

      <p className="text-center text-xs text-zinc-600">
        Everything here stays on this local network. Nothing is sent to the internet.
      </p>
    </div>
  );
}
