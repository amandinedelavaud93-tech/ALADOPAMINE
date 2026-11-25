// /api/strava/callback.js
const pendingAuthSessions = new Map();

function getBaseUrl(req) {
  if (process.env.STRAVA_APP_URL) {
    return process.env.STRAVA_APP_URL.replace(/\/+$/, '');
  }
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  const clientId = process.env.STRAVA_CLIENT_ID || '299273';
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const baseUrl = getBaseUrl(req);

  if (!clientSecret) {
    return res.status(500).json({ error: 'STRAVA_CLIENT_SECRET manquant côté serveur' });
  }

  // 1. Renouvellement de token (appelé par le front sans exposer le secret)
  if (req.method === 'POST') {
    try {
      const { refresh_token } = req.body || {};
      if (!refresh_token) {
        return res.status(400).json({ error: 'refresh_token manquant' });
      }

      const tokenRes = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token
        })
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        return res.status(tokenRes.status).json({ error: 'Erreur refresh Strava', details: tokenData });
      }

      // On renvoie uniquement les informations nécessaires (éviter d'exposer le refresh_token si géré côté serveur)
      return res.status(200).json({
        ok: true,
        access_token: tokenData.access_token,
        expires_at: tokenData.expires_at
      });
    } catch (err) {
      console.error('Strava POST error:', err);
      return res.status(500).json({ error: 'Erreur interne renouvellement Strava' });
    }
  }

  // 2. Récupération ponctuelle d'une session OAuth validée par le front
  if (req.method === 'GET' && req.query.session_ref) {
    const ref = String(req.query.session_ref);
    const entry = pendingAuthSessions.get(ref);
    if (!entry || Date.now() > entry.expiresAt) {
      pendingAuthSessions.delete(ref);
      return res.status(404).json({ error: 'Session OAuth expirée ou introuvable' });
    }
    pendingAuthSessions.delete(ref);
    return res.status(200).json({
      ok: true,
      athlete: entry.athlete,
      expires_at: entry.expires_at
    });
  }

  // 3. Callback OAuth GET depuis Strava
  if (req.method === 'GET') {
    const { code, error, state } = req.query;
    const stateParam = state ? `&state=${encodeURIComponent(String(state))}` : '';

    if (error) {
      return res.redirect(302, `${baseUrl}/?strava_error=${encodeURIComponent(String(error))}${stateParam}`);
    }

    if (!code) {
      return res.redirect(302, `${baseUrl}/?strava_error=missing_code${stateParam}`);
    }

    try {
      const tokenRes = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code: String(code),
          grant_type: 'authorization_code'
        })
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        console.error('Strava token exchange failed:', tokenData);
        return res.redirect(302, `${baseUrl}/?strava_error=token_exchange_failed${stateParam}`);
      }

      const sessionRef = `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
      pendingAuthSessions.set(sessionRef, {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: tokenData.expires_at,
        athlete: tokenData.athlete
          ? {
              id: tokenData.athlete.id,
              firstname: tokenData.athlete.firstname,
              lastname: tokenData.athlete.lastname
            }
          : null,
        expiresAt: Date.now() + 2 * 60 * 1000
      });

      return res.redirect(
        302,
        `${baseUrl}/?strava_connected=1&strava_auth_ref=${encodeURIComponent(sessionRef)}${stateParam}`
      );
    } catch (err) {
      console.error('Strava callback error:', err);
      return res.redirect(302, `${baseUrl}/?strava_error=server_error${stateParam}`);
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}
