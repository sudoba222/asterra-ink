"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** Global client providers. Motion respects the user's reduced-motion setting. */
export function AppProviders({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
