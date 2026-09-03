import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { companyName, taxId, country } = req.body

    // Placeholder - implementa ricerca Hungary reale
    const result = {
      success: true,
      query: { companyName, taxId, country },
      message: 'Ricerca Hungary implementata',
      timestamp: new Date().toISOString()
    }

    return res.status(200).json(result)
  } catch (error) {
    console.error('Search error:', error)
    return res.status(500).json({ error: 'Errore ricerca' })
  }
}

export const config = {
  api: {
    bodyParser: true
  }
}
