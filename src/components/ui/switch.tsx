"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Minimal accessible switch — same role + keyboard semantics as Radix Switch
 * but without the extra dependency. Active state uses the studio's sage
 * palette; inactive uses a neutral sage-50 track.
 */
interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
  id?: string;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  function Switch({ checked, onCheckedChange, disabled, id, ...props }, ref) {
    return (
      <button
        ref={ref}
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={props["aria-label"]}
        data-state={checked ? "checked" : "unchecked"}
        disabled={disabled}
        onClick={() => !disabled && onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sage-400 focus:ring-offset-2",
          checked ? "bg-sage-600" : "bg-sage-200",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform",
            // In RTL, `translate-x` direction flips naturally because
            // the parent button is laid out RTL; we use logical positioning
            // via margin-inline so the knob slides visually from the "off"
            // side to the "on" side regardless of direction.
            checked ? "ltr:translate-x-5 rtl:-translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
    );
  },
);
