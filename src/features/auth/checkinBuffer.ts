/** "1 min" / "2 min" / etc. for a CHECKIN_BUFFER_CHOICES_S value. */
export function checkinBufferLabel(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}
