import { ageFromBirthDate } from '../src/lib/birthDate.mjs';
/** Server check of the account's declared birth date; this is not identity verification. */
export function declaredAdultAge(user, now = new Date()) {
  return ageFromBirthDate(user?.user_metadata?.birth_date, now);
}
export function assertAdultAccess(user, consent, now) {
  if (!user?.id) throw Object.assign(new Error('Inicia sesión para utilizar el modo adulto.'), { status: 401, code: 'login_required' });
  const age = declaredAdultAge(user, now);
  if (age === null) throw Object.assign(new Error('Completa tu fecha de nacimiento real en Mi perfil para continuar.'), { status: 403, code: 'adult_age_required' });
  if (age < 18) throw Object.assign(new Error('El modo adulto no está disponible para esta cuenta.'), { status: 403, code: 'adult_not_eligible' });
  if (consent !== true) throw Object.assign(new Error('Confirma el consentimiento del modo adulto antes de continuar.'), { status: 403, code: 'adult_consent_required' });
}
