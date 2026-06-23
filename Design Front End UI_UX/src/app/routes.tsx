import { createBrowserRouter, Outlet } from "react-router";
import { Sidebar, Header } from "./components/layout";
import Overview from "./pages/Overview";
import Portfolio from "./pages/Portfolio";
import LeadExplorer from "./pages/LeadExplorer";
import Campaigns from "./pages/Campaigns";
import Inbox from "./pages/Inbox";

function Root() {
  return (
    <div className="flex min-h-screen bg-bg text-text">
      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-brand/10 blur-[120px] rounded-full mix-blend-screen opacity-50 animate-pulse" style={{ animationDuration: '18s' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-copper/10 blur-[120px] rounded-full mix-blend-screen opacity-50 animate-pulse" style={{ animationDuration: '14s' }} />
        <svg className="absolute inset-0 w-full h-full opacity-[0.03] mix-blend-overlay">
          <filter id="noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#noise)" />
        </svg>
      </div>

      <Sidebar />
      <main className="flex-1 ml-[288px] flex flex-col min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}

// Fallback empty page for other routes
function Placeholder({ title }: { title: string }) {
  return (
    <>
      <Header title={title} />
      <div className="p-8">
        <div className="flex items-center justify-center h-64 border border-dashed border-border rounded-xl text-text-muted">
          {title} Screen - Coming Soon
        </div>
      </div>
    </>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: Overview },
      { path: "portfolio", Component: Portfolio },
      { path: "dashboard", Component: LeadExplorer },
      { path: "campaigns", Component: Campaigns },
      { path: "inbox", Component: Inbox },
      { path: "portfolio/kanban", element: <Placeholder title="Sales Kanban" /> },
      { path: "acquisition", element: <Placeholder title="Acquisition Advisor" /> },
      { path: "watchlist", element: <Placeholder title="Watchlist" /> },
      { path: "quick-send", element: <Placeholder title="Quick Send" /> },
      { path: "analytics", element: <Placeholder title="Analytics" /> },
      { path: "templates", element: <Placeholder title="Templates" /> },
      { path: "settings", element: <Placeholder title="Settings" /> },
      { path: "*", element: <Placeholder title="Not Found" /> },
    ],
  },
]);
