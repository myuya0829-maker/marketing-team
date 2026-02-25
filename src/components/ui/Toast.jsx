import { useEffect } from "react";
import { T } from "../../lib/constants";

export default function Toast({ msg, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: T.radius,
        padding: "12px 24px",
        color: T.text,
        fontSize: 14,
        zIndex: 9999,
        boxShadow: T.shadow,
        animation: "fadeIn 0.3s ease",
      }}
    >
      {msg}
    </div>
  );
}
