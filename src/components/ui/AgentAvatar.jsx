import { T } from "../../lib/constants";

export default function AgentAvatar({ agent, size = 40, active, showName }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: active ? agent.color + "22" : T.bgCard,
          border: `2px solid ${active ? agent.color : T.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.5,
          transition: "all 0.2s",
          boxShadow: active ? `0 0 16px ${agent.color}44` : "none",
        }}
      >
        {agent.icon}
      </div>
      {showName && (
        <span style={{ fontSize: 10, color: active ? agent.color : T.textMuted }}>
          {agent.name}
        </span>
      )}
    </div>
  );
}
