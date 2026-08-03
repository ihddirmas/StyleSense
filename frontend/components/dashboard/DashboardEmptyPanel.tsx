"use client";
import { QuickActions } from "./QuickActions";
import { WardrobeFetchError } from "./WardrobeFetchError";
import { UsageMeter } from "./UsageMeter";

interface DashboardEmptyPanelProps {
  fetchError: boolean;
  onRetry: () => void;
}

export function DashboardEmptyPanel({ fetchError, onRetry }: DashboardEmptyPanelProps) {
  return (
    <section className="dashboard-empty-panel" aria-label="Get started">
      {fetchError && <WardrobeFetchError onRetry={onRetry} />}
      <div className="dashboard-empty-panel-actions">
        <h2 className="section-label">Get started</h2>
        <QuickActions />
      </div>
      <div className="max-w-sm">
        <UsageMeter />
      </div>
    </section>
  );
}
