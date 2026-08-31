import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import CornellNotes from "./pages/CornellNotes";
import Assistant from "./pages/Assistant";
import History from "./pages/History";
import Vault from "./pages/Vault";
import Journal from "./pages/Journal";
import IronSharpenIron from "./pages/IronSharpenIron";
import LiveStudy from "./pages/LiveStudy";
import AIAssistantOverlay from "./components/AIAssistantOverlay";
import MobileNavBar from "./components/MobileNavBar";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/notes"}><CornellNotes /></Route>
      <Route path={"/assistant"} component={Assistant} />
      <Route path={"/history"} component={History} />
      <Route path={"/vault"} component={Vault} />
      <Route path={"/journal"} component={Journal} />
      <Route path={"/iron"} component={IronSharpenIron} />
      <Route path={"/live"} component={LiveStudy} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
          <AIAssistantOverlay />
          <MobileNavBar />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
