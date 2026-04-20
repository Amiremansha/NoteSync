const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const normalizeKeyBytes = async (rawKey: string) => {
  const cleaned = rawKey.trim();

  try {
    const bytes = fromBase64(cleaned);
    if (bytes.byteLength === 32) {
      return bytes;
    }
  } catch {
    // Fall back to hashing the raw secret string.
  }

  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(cleaned));
  return new Uint8Array(digest);
};

const importKey = async () => {
  const secret = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");

  if (!secret) {
    throw new Error("Missing GOOGLE_TOKEN_ENCRYPTION_KEY secret.");
  }

  const keyBytes = await normalizeKeyBytes(secret);

  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
};

export const encryptSecret = async (plaintext: string) => {
  if (!plaintext) {
    return "";
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importKey();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext),
  );

  return `${toBase64(iv)}:${toBase64(new Uint8Array(encrypted))}`;
};

export const decryptSecret = async (ciphertext: string) => {
  if (!ciphertext) {
    return "";
  }

  const [ivBase64, payloadBase64] = ciphertext.split(":");

  if (!ivBase64 || !payloadBase64) {
    throw new Error("Invalid encrypted secret payload.");
  }

  const key = await importKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivBase64) },
    key,
    fromBase64(payloadBase64),
  );

  return decoder.decode(decrypted);
};
