import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
export function sealRecovery(value, key) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([Buffer.from('ALIST1'), iv, cipher.getAuthTag(), encrypted]);
}
export function openRecovery(data, key) {
  if (data.length < 34 || data.subarray(0, 6).toString() !== 'ALIST1')
    throw Error('Invalid backup format');
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(6, 18));
  decipher.setAuthTag(data.subarray(18, 34));
  return JSON.parse(
    Buffer.concat([decipher.update(data.subarray(34)), decipher.final()]).toString(),
  );
}
