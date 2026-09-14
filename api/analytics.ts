const INGEST_URL = 'https://lufvkrnwqbqdaqcgljxt.supabase.co/functions/v1/planetx-analytics-ingest'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const key = process.env.PLANETX_ANALYTICS_INGEST_KEY
  if (!key) return res.status(503).json({ error: 'Analytics is not configured' })
  const upstream = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-PlanetX-Analytics-Key': key },
    body: JSON.stringify(req.body),
  })
  const body = await upstream.text()
  res.status(upstream.status).setHeader('Content-Type', 'application/json').send(body)
}
