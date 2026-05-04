/**
 * Single source of truth for the "available seats" copy + visual state.
 *
 * Used on both the schedule (regular classes) and the workshops list
 * so the studio copy stays consistent everywhere.
 *
 * Tier breakdown:
 *   availableSpots > 3   → "יש מקום"             — relaxed, plenty of room
 *   availableSpots == 3  → "נשארו 3 מקומות"      — neutral nudge
 *   availableSpots == 2  → "נשארו 2 מקומות"      — warmer urgency
 *   availableSpots == 1  → "נשאר מקום אחרון"    — strong urgency, singular
 *   availableSpots == 0  → "מלא"                  — full, register triggers waitlist
 *
 * The `tone` field maps to the consumer's existing Tailwind palette:
 *   - "available" → emerald (free, low pressure)
 *   - "limited"   → amber  (urgency without alarm)
 *   - "last"      → orange (strong urgency, singular)
 *   - "full"      → red    (full)
 */

export type CapacityTone = "available" | "limited" | "last" | "full";

export interface CapacityStatus {
  /** Hebrew label to show on the badge. */
  label: string;
  /** Visual tone for the consumer to map to a colour palette. */
  tone: CapacityTone;
  /** True iff there's at least one open seat (i.e. tone !== "full"). */
  hasSeats: boolean;
  /** Numeric availability used to derive label/tone (clamped to ≥ 0). */
  availableSpots: number;
}

/**
 * @param availableSpots  capacity − current registrations (> 0 = open seats)
 *                        If `null` / `undefined` → assumed unlimited
 *                        capacity (no limit set on the workshop). In that
 *                        case we render "יש מקום" with the available tone.
 */
export function getCapacityStatus(
  availableSpots: number | null | undefined,
): CapacityStatus {
  // No capacity limit set → infinite seats, treated as plenty available.
  if (availableSpots == null) {
    return {
      label: "יש מקום",
      tone: "available",
      hasSeats: true,
      availableSpots: Infinity,
    };
  }

  const spots = Math.max(0, Math.floor(availableSpots));

  if (spots === 0) {
    return { label: "מלא", tone: "full", hasSeats: false, availableSpots: 0 };
  }

  if (spots === 1) {
    return {
      label: "נשאר מקום אחרון",
      tone: "last",
      hasSeats: true,
      availableSpots: 1,
    };
  }

  if (spots === 2) {
    return {
      label: "נשארו 2 מקומות",
      tone: "limited",
      hasSeats: true,
      availableSpots: 2,
    };
  }

  if (spots === 3) {
    return {
      label: "נשארו 3 מקומות",
      tone: "limited",
      hasSeats: true,
      availableSpots: 3,
    };
  }

  // > 3 seats — relaxed copy.
  return {
    label: "יש מקום",
    tone: "available",
    hasSeats: true,
    availableSpots: spots,
  };
}
