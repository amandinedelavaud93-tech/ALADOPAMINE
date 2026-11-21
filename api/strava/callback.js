export default async function handler(req, res) {
  try {
    const { code, error, state } = req.query || {};

    if (error) {
      return res.status(400).json({
        ok: false,
        error: `Strava authorization error: ${error}`
      });
    }

    if (!code) {
      return res.status(400).json({
        ok: false,
        error: 'Missing authorization code from Strava'
      });
    }

    const clientId = process.env.STRAVA_CLIENT_ID;
    const clientSecret = process.env.STRAVA_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({
        ok: false,
        error: 'Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET in environment variables'
      });
    }

    const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code'
      })
    });

    const rawText = await tokenResponse.text();
    let tokenData;
    try {
      tokenData = JSON.parse(rawText);
    } catch {
      return res.status(502).json({
        ok: false,
        error: `Non-JSON response from Strava token endpoint: ${rawText.slice(0, 300)}`
      });
    }

    if (!tokenResponse.ok) {
      return res.status(tokenResponse.status).json({
        ok: false,
        error: tokenData?.message || 'Strava token exchange failed',
        details: tokenData
      });
    }

    const redirectBase = process.env.STRAVA_REDIRECT_APP_URL || 'https://dopamine-teal.vercel.app/';
    const redirectUrl = new URL(redirectBase);
    redirectUrl.searchParams.set('strava_connected', '1');
    if (state) {
      redirectUrl.searchParams.set('state', String(state));
    }
    if (tokenData.access_token) {
      redirectUrl.searchParams.set('strava_access_token', tokenData.access_token);
    }
    if (tokenData.refresh_token) {
      redirectUrl.searchParams.set('strava_refresh_token', tokenData.refresh_token);
    }
    if (tokenData.expires_at) {
      redirectUrl.searchParams.set('strava_expires_at', String(tokenData.expires_at));
    }
    if (tokenData.athlete?.id) {
      redirectUrl.searchParams.set('strava_athlete_id', String(tokenData.athlete.id));
    }

    return res.redirect(302, redirectUrl.toString());
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Internal server error in Strava callback'
    });
  }
}
