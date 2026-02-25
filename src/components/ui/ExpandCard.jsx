import { useState } from "react";
import { T } from "../../lib/constants";
import Card from "./Card";

export default function ExpandCard({ title, content, borderColor }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card style={{ borderLeft: borderColor ? `3px solid ${borderColor}` : undefined }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{title}</span>
        <span
          style={{
            fontSize: 11,
            color: T.textMuted,
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "0.2s",
            marginLeft: "auto",
          }}
        >
          ▼
        </span>
      </div>
      {expanded && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${T.border}`,
            fontSize: 13,
            color: T.textDim,
            lineHeight: 1.8,
            whiteSpace: "pre-wrap",
            maxHeight: 400,
            overflow: "auto",
          }}
        >
          {content}
        </div>
      )}
    </Card>
  );
}
