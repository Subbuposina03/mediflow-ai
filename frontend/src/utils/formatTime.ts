/**
 * Custom 12-Hour Time & Date Formatter for MediFlow AI.
 * Guarantees 12-hour format with AM/PM (e.g., 1:00 PM, 12:30 AM) across all platforms.
 */

export function formatTime12(dateInput: string | Date | number | null | undefined): string {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);

  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 becomes 12
  const minStr = minutes < 10 ? `0${minutes}` : minutes;

  return `${hours}:${minStr} ${ampm}`;
}

export function formatTimeWithSeconds12(dateInput: string | Date | number | null | undefined): string {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);

  let hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = d.getSeconds();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minStr = minutes < 10 ? `0${minutes}` : minutes;
  const secStr = seconds < 10 ? `0${seconds}` : seconds;

  return `${hours}:${minStr}:${secStr} ${ampm}`;
}

export function formatDateTime12(dateInput: string | Date | number | null | undefined): string {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);

  const day = d.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthStr = months[d.getMonth()];
  const year = d.getFullYear();

  return `${day} ${monthStr} ${year}, ${formatTime12(d)}`;
}
