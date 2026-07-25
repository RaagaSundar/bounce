/**
 * Room codes and the error type the REST archive routes throw.
 *
 * Extracted from the old game-store so the archive endpoints do not depend on
 * the deleted quiz engine.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Codes are `[A-Z2-9]{6}`. I, O, 0 and 1 are excluded so a code read aloud or
 * off a projector is unambiguous.
 */
export function normalizeRoomCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) {
    throw new ApiError("Enter a valid six-character room code.", 400);
  }
  return code;
}
