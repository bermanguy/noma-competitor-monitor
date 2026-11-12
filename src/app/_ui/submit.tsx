"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/** A submit button that says what is happening while a slow action (such as a preview) runs. */
export function Submit({ children, pending, className, formAction }: {
  children: ReactNode; pending?: string; className?: string; formAction?: (f: FormData) => void | Promise<void>;
}) {
  const s = useFormStatus();
  return (
    <button className={className} formAction={formAction} disabled={s.pending}>
      {s.pending && pending ? pending : children}
    </button>
  );
}
