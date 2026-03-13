import { useEffect } from "react";
import { useProjectStore } from "./stores/projectStore";
import { TransportBar } from "./components/TransportBar";
import { Sidebar } from "./components/Sidebar";
import { Timeline } from "./components/Timeline";
import { UtilityPanel } from "./components/UtilityPanel";

export default function App() {
  const load = useProjectStore((s) => s.load);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col h-full bg-deck-bg text-deck-text font-sans">
      <TransportBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <Timeline />
        </div>
        <UtilityPanel />
      </div>
    </div>
  );
}
