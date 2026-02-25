import { AppProvider } from "./contexts/AppContext";
import MarketingTeamAI from "./components/layout/App";

export default function App() {
  return (
    <AppProvider>
      <MarketingTeamAI />
    </AppProvider>
  );
}
