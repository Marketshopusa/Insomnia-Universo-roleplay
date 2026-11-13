/** Calculate age from a complete ISO calendar date, without silently correcting invalid dates. */
export function ageFromBirthDate(value, now = new Date()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (birth.getUTCFullYear() !== year || birth.getUTCMonth() !== month - 1 || birth.getUTCDate() !== day) return null;
  const beforeBirthday = now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day);
  const age = now.getUTCFullYear() - year - Number(beforeBirthday);
  return age >= 0 && age <= 125 ? age : null;
}
