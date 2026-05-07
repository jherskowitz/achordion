import type { ReactNode } from "react";
import { isFeatureEnabledForViewer } from "@/lib/flags";

interface FeatureFlagProps {
  flag: string;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Server component that renders `children` only when the named flag
 * is enabled for the current viewer. See `lib/flags.ts` for resolution
 * rules and admin ops.
 */
export async function FeatureFlag({
  flag,
  children,
  fallback = null,
}: FeatureFlagProps) {
  const enabled = await isFeatureEnabledForViewer(flag);
  return <>{enabled ? children : fallback}</>;
}
