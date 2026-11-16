import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
export const MAGNUM_PROFILE = 'magnum-conversation';
export const MAGNUM_MODEL = 'magnum-v4-12b';
export const MAGNUM_CHANNEL = 'insomnia-magnum-conversation-v1';
function key(secret) {
  const value = Buffer.from(secret || '', 'base64');
  if (value.length !== 32) throw new Error('magnum_bridge_not_configured');
  return value;
}
export function sealMagnum(value, direction, secret = process.env.MAGNUM_CONVERSATION_SECRET) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  cipher.setAAD(Buffer.from('insomnia:magnum:v1:' + direction));
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}
export function openMagnum(packet, direction, secret = process.env.MAGNUM_CONVERSATION_SECRET, now = Date.now()) {
  if (packet?.v !== 1 || typeof packet.data !== 'string' || packet.data.length > 100000) throw new Error('invalid_magnum_packet');
  const iv = Buffer.from(packet.iv || '', 'base64'), tag = Buffer.from(packet.tag || '', 'base64');
  if (iv.length !== 12 || tag.length !== 16) throw new Error('invalid_magnum_packet');
  const decipher = createDecipheriv('aes-256-gcm', key(secret), iv);
  decipher.setAAD(Buffer.from('insomnia:magnum:v1:' + direction)); decipher.setAuthTag(tag);
  const value = JSON.parse(Buffer.concat([decipher.update(Buffer.from(packet.data, 'base64')), decipher.final()]).toString('utf8'));
  if (value.profile !== MAGNUM_PROFILE || typeof value.id !== 'string' || !Number.isFinite(value.expiresAt) || value.expiresAt < now || value.expiresAt > now + 65000) throw new Error('expired_magnum_packet');
  return value;
}
