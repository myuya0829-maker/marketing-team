import { T } from "../../lib/constants";

export default function Card({ children, style, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: T.radius,
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
