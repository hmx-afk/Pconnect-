// PConnect - Pi identity helper
export async function verifyPi(req) {
  const match = String(req.headers.authorization || "")
    .match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  if (token.length < 20) return null;

  try {
    const r = await fetch("https://api.minepi.com/v2/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) return null;

    const u = await r.json();
    const username = String(u.username || "").trim();
    const uid = String(u.uid || "").trim();
    if (!username || !uid) return null;

    return { username, uid };
  } catch {
    return null;
  }
}
