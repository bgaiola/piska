/**
 * Tracks the current chain count.
 *
 * A "chain" forms when a match is produced as a consequence of falling debris
 * from a previous clear rather than a direct player swap. `current` starts at
 * 1, where 1 means "no chain bonus" and >=2 means an active cascade.
 *
 * The engine sets `cascading` to true while any blocks are still falling or
 * clearing from the most recent resolved match, and calls `registerMatch` when
 * a new match is detected. The match counts as a cascade iff `cascading` is
 * true at the moment of detection. When the grid finally settles with no new
 * match, the engine calls `settle()` to report whether a chain was broken.
 */
export class ChainTracker {
  current: number = 1;
  cascading: boolean = false;

  /**
   * Register that a match has just been detected.
   *
   * @param isCascade true iff the match occurred while a cascade was pending
   *                  (i.e. blocks were falling/clearing from a previous match).
   * @returns the chain number this match counts as.
   */
  registerMatch(isCascade: boolean): number {
    if (isCascade) {
      this.current += 1;
    } else {
      this.current = 1;
    }
    return this.current;
  }

  /**
   * Call when the grid is fully settled (no falling/clearing/swapping AND no
   * pending matches). Reports whether a chain >1 was just terminated and
   * resets `current` to 1.
   */
  settle(): { broken: boolean; finalChain: number } {
    const broken = this.current > 1;
    const finalChain = this.current;
    this.current = 1;
    this.cascading = false;
    return { broken, finalChain };
  }

  reset(): void {
    this.current = 1;
    this.cascading = false;
  }
}
