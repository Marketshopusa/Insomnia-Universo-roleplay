/** Server check of the account's declared birth date; this is not identity verification. */
export function declaredAdultAge(user, now = new Date()) {
  const value = user?.user_metadata?.birth_date;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (birth.getUTCFullYear() !== year || birth.getUTCMonth() !== month - 1 || birth.getUTCDate() !== day) return null;
  const beforeBirthday = now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day);
  const age = now.getUTCFullYear() - year - Number(beforeBirthday);
  return age >= 0 && age <= 125 ? age : null;
}
export function assertAdultAccess(user, consent, now) {
  if (!user?.id) throw Object.assign(new Error('Inicia sesión para utilizar el modo adulto.'), { status: 401, code: 'login_required' });
  const age = declaredAdultAge(user, now);
  if (age === null) throw Object.assign(new Error('Falta una fecha de nacimiento válida en tu cuenta. La declaración del interruptor no sustituye este dato.'), { status: 403, code: 'adult_age_required' });
  if (age < 18) throw Object.assign(new Error('El modo adulto no está disponible para esta cuenta.'), { status: 403, code: 'adult_not_eligible' });
  if (consent !== true) throw Object.assign(new Error('Confirma el consentimiento del modo adulto antes de continuar.'), { status: 403, code: 'adult_consent_required' });
}
