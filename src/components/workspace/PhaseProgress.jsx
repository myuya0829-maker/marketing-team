import { T, PHASES } from "../../lib/constants";

export default function PhaseProgress({ currentPhase }) {
  const idx = PHASES.findIndex((p) => p.id === currentPhase);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "16px 0", overflow: "auto" }}>
      {PHASES.filter((p) => p.id !== "idle").map((phase, i, arr) => {
        const pi = PHASES.findIndex((p2) => p2.id === phase.id);
        const active = pi === idx;
        const done = pi < idx;
        const clr = active ? T.accent : done ? T.success : T.textMuted;

        return (
          <div key={phase.id} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 70 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: done ? T.success + "22" : active ? T.accent + "22" : "transparent",
                  border: `2px solid ${clr}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  boxShadow: active ? `0 0 12px ${T.accent}44` : "none",
                }}
              >
                {done ? "✓" : phase.icon}
              </div>
              <span style={{ fontSize: 10, color: clr, whiteSpace: "nowrap" }}>{phase.label}</span>
            </div>
            {i < arr.length - 1 && (
              <div
                style={{
                  width: 24,
                  height: 2,
                  background: done ? T.success : T.border,
                  margin: "0 2px",
                  marginBottom: 18,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
