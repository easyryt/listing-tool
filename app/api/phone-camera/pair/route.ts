import { createHash, randomBytes } from "node:crypto";
import QRCode from "qrcode";

const ttl = 300;
const secretPattern = /^[\w-]{32}$/;
const localHostPattern = /^(?:(?:[\w-]+\.)*localhost\.?|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1?\])(?::\d+)?$/i;
const secret = () => randomBytes(24).toString("base64url");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const development = process.env.NODE_ENV === "development" && process.env.VERCEL !== "1";

type Pairing = { laptop: string; phone: string; offer: string; answer?: string };
type PairingAction = "offer" | "join" | "answer" | "close";
type ExchangeResult = [status: number, description?: string];
const localPairings = new Map<string, { pairing: Pairing; expires: number }>();
let localAttempts = { count: 0, expires: 0 };

function countLocalAttempts(now: number) {
  if (localAttempts.expires <= now) localAttempts = { count: 0, expires: now + 60_000 };
  return ++localAttempts.count;
}

function exchangeLocal(id: string, action: PairingAction, token: string, answer: string): ExchangeResult {
  const entry = localPairings.get(id);
  if (!entry || entry.expires <= Date.now()) {
    localPairings.delete(id);
    return [404];
  }
  const { pairing } = entry;
  if (action === "answer" || action === "close") {
    if (token !== pairing.laptop) return [404];
    if (action === "answer") return [200, pairing.answer];
    localPairings.delete(id);
    return [200];
  }
  if (token !== pairing.phone) return [404];
  if (action === "offer") return [200, pairing.offer];
  if (pairing.answer && pairing.answer !== answer) return [409];
  pairing.answer = answer;
  return [200];
}

const rateLimit = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then redis.call('EXPIRE', KEYS[1], 60) end
  return count
`;
const exchange = `
  local raw = redis.call('GET', KEYS[1])
  if not raw then return {404} end
  local session = cjson.decode(raw)
  local action, token, answer = ARGV[1], ARGV[2], ARGV[3]
  if action == 'answer' or action == 'close' then
    if token ~= session.laptop then return {404} end
    if action == 'close' then redis.call('DEL', KEYS[1]); return {200} end
    return {200, session.answer or ''}
  end
  if token ~= session.phone then return {404} end
  if action == 'offer' then return {200, session.offer} end
  if session.answer and session.answer ~= answer then return {409} end
  if not session.answer then
    session.answer = answer
    redis.call('SET', KEYS[1], cjson.encode(session), 'KEEPTTL')
  end
  return {200}
`;

function validSdp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 16_384 && value.startsWith("v=0\r\n") && value.includes("\r\nm=application ");
}

function phoneOrigin(origin: string, localHost: boolean) {
  if (!localHost && origin.startsWith("https://")) return origin;
  if (!development || !process.env.PHONE_CAMERA_DEV_ORIGIN) return null;
  try {
    const url = new URL(process.env.PHONE_CAMERA_DEV_ORIGIN);
    return url.protocol === "https:" && url.href === `${url.origin}/` && !localHostPattern.test(url.host) ? url.origin : null;
  } catch { return null; }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const fetchSite = request.headers.get("sec-fetch-site");
  const loopback = /^(?:(?:[\w-]+\.)*localhost\.?|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/i.test(host ?? "");
  // Next may serialize request.url using its internal listener hostname.
  const sameOrigin = origin && host && (!fetchSite || fetchSite === "same-origin") &&
    (origin === `https://${host}` || (loopback && origin === `http://${host}`));
  const nativeRequest = !origin && !fetchSite && request.headers.get("content-type")?.split(";", 1)[0] === "application/json";
  const wrongOrigin = () => reply({ message: "Open the Claims site directly to pair the camera." }, 403);
  if (!sameOrigin && !nativeRequest) return wrongOrigin();
  const [url, token] = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? [process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN]
    : [process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN];

  let body: Record<string, unknown>;
  try {
    if (Number(request.headers.get("content-length")) > 32_768) return reply({ message: "Pairing message too large." }, 413);
    const text = await request.text();
    if (text.length > 32_768) return reply({ message: "Pairing message too large." }, 413);
    body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return reply({ message: "Invalid pairing message." }, 400);
  }

  const redis = async <T,>(...command: (string | number)[]): Promise<T> => {
    if (!url || !token) throw new Error("Pairing store unavailable");
    const response = await fetch(url, {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(command),
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error("Pairing store unavailable");
    return data.result;
  };

  const { action, id, key, sdp } = body;
  // Native phones authenticate with the QR secret. Creating a session and reading its answer remain same-origin browser operations.
  if (!sameOrigin && action !== "offer" && action !== "join") return wrongOrigin();
  if (!development && (!url || !token)) return reply({ message: "Phone camera pairing needs to be enabled by the site owner." }, 503);
  try {
    if (action === "create" && origin && host) {
      if (!validSdp(sdp)) return reply({ message: "Could not prepare a phone camera connection." }, 400);
      const address = phoneOrigin(origin, localHostPattern.test(host));
      if (!address) return reply({ message: "Open Claims from a trusted HTTPS address your phone can reach. Then choose Connect phone to show the QR code." }, 422);
      const now = Date.now();
      const client = request.headers.get("x-vercel-forwarded-for") || "unknown";
      const count = development ? countLocalAttempts(now)
        : await redis<number>("EVAL", rateLimit, 1, `phone-camera:rate:${hash(client)}`);
      if (count > 20) return reply({ message: "Too many pairing attempts. Wait a minute and try again." }, 429);
      const id = secret();
      const laptop = secret();
      const phone = secret();
      const pair = new URL("/camera", address);
      pair.hash = `${id}.${phone}`;
      const qr = await QRCode.toDataURL(pair.href, { width: 256, margin: 3 });
      const pairing = { laptop: hash(laptop), phone: hash(phone), offer: sdp };
      if (development) {
        for (const [id, entry] of localPairings) if (entry.expires <= now) localPairings.delete(id);
        localPairings.set(id, { pairing, expires: Date.now() + ttl * 1000 });
      } else {
        await redis("SET", `phone-camera:${id}`, JSON.stringify(pairing), "EX", ttl);
      }
      return reply({ id, laptop, qr, ttl }, 201);
    }

    if (typeof id !== "string" || !secretPattern.test(id) || typeof key !== "string" || !secretPattern.test(key) ||
      (action !== "offer" && action !== "join" && action !== "answer" && action !== "close") || (action === "join" && !validSdp(sdp))) {
      return reply({ message: "Invalid pairing message." }, 400);
    }
    const answer = typeof sdp === "string" && action === "join" ? sdp : "";
    const [status, description] = development ? exchangeLocal(id, action, hash(key), answer)
      : await redis<ExchangeResult>("EVAL", exchange, 1, `phone-camera:${id}`, action, hash(key), answer);
    if (status === 404) return reply({ message: "This pairing code has expired. Show a new code on the laptop." }, 404);
    if (status === 409) return reply({ message: "Another phone already used this code. Show a new code on the laptop." }, 409);
    return reply({ sdp: description || null });
  } catch {
    return reply({ message: "The camera pairing service is temporarily unavailable. Try again shortly." }, 503);
  }
}
