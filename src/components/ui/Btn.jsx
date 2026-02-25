import { T } from "../../lib/constants";

const VARIANTS = {
  primary: { background: T.accent, color: "#fff", border: "none" },
  secondary: { background: "transparent", color: T.text, border: `1px solid ${T.border}` },
  danger: { background: T.error + "22", color: T.error, border: `1px solid ${T.error}44` },
  ghost: { background: "transparent", color: T.textDim, border: "none" },
  success: { background: T.success, color: "#fff", border: "none" },
};

export default function Btn({ children, onClick, variant = "primary", disabled, style }) {
  const v = VARIANTS[variant] || {};
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...v,
        padding: "8px 16px",
        borderRadius: T.radiusSm,
        fontSize: 13,
        fontFamily: T.font,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.2s",
        fontWeight: 500,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
