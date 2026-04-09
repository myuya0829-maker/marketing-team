import { AppProvider } from "./contexts/AppContext";
import Stack from "./components/layout/App";

export default function App() {
  return (
    <AppProvider>
      <Stack />
    </AppProvider>
  );
}
