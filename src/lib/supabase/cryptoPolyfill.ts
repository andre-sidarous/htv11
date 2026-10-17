import * as ExpoCrypto from "expo-crypto";

/**
 * React Native has no WebCrypto. Supabase's PKCE sign-in (Google / OAuth) needs
 * `crypto.subtle.digest("SHA-256", …)` for the code challenge and `crypto.getRandomValues` for the
 * verifier; without them it warns "WebCrypto API is not supported" and falls back to the weaker
 * "plain" method (and Math.random). expo-crypto provides both natively. Only fills what's missing.
 */
type CryptoShim = {
  getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
  subtle?: { digest: (algorithm: AlgorithmIdentifier, data: BufferSource) => Promise<ArrayBuffer> };
};

const ALGORITHMS: Record<string, ExpoCrypto.CryptoDigestAlgorithm> = {
  "SHA-1": ExpoCrypto.CryptoDigestAlgorithm.SHA1,
  "SHA-256": ExpoCrypto.CryptoDigestAlgorithm.SHA256,
  "SHA-384": ExpoCrypto.CryptoDigestAlgorithm.SHA384,
  "SHA-512": ExpoCrypto.CryptoDigestAlgorithm.SHA512,
};

const g = globalThis as unknown as { crypto?: CryptoShim };
const shim: CryptoShim = g.crypto ?? {};

if (typeof shim.getRandomValues !== "function") {
  shim.getRandomValues = (array) => ExpoCrypto.getRandomValues(array as never) as typeof array;
}

if (typeof shim.subtle?.digest !== "function") {
  shim.subtle = {
    digest(algorithm, data) {
      const name = (typeof algorithm === "string" ? algorithm : algorithm.name).toUpperCase();
      const expo = ALGORITHMS[name];
      if (!expo) return Promise.reject(new Error(`Unsupported digest algorithm: ${name}`));
      return ExpoCrypto.digest(expo, data);
    },
  };
}

// Supabase's check also needs TextEncoder (built into Hermes; this is only a fallback).
const withEncoder = globalThis as unknown as { TextEncoder?: unknown };
if (typeof withEncoder.TextEncoder === "undefined") {
  withEncoder.TextEncoder = class {
    readonly encoding = "utf-8";
    encode(input = ""): Uint8Array {
      const utf8 = unescape(encodeURIComponent(input));
      const bytes = new Uint8Array(utf8.length);
      for (let i = 0; i < utf8.length; i++) bytes[i] = utf8.charCodeAt(i);
      return bytes;
    }
  };
}

if (!g.crypto) {
  try {
    g.crypto = shim;
  } catch {
    Object.defineProperty(globalThis, "crypto", { value: shim, configurable: true });
  }
}
