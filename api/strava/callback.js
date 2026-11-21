export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { code, refresh_token } = req.body || {};
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: "Variables Strava manquantes sur Vercel" });
  }

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret
    });

    if (code) {
      params.append("code", code);
      params.append("grant_type", "authorization_code");
    } else if (refresh_token) {
      params.append("refresh_token", refresh_token);
      params.append("grant_type", "refresh_token");
    } else {
      return res.status(400).json({ error: "Paramètre code ou refresh_token requis" });
    }

    const stravaResponse = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });

    const data = await stravaResponse.json();

    if (!stravaResponse.ok) {
      return res.status(stravaResponse.status).json({
        error: "Erreur Strava OAuth",
        details: data
      });
    }

    return res.status(200).json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      athlete: data.athlete || null
    });
  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur lors de l'échange OAuth Strava" });
  }
}
