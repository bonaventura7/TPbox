import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Vercel non supporta FormData direttamente nelle API routes
    // Il frontend deve inviare JSON
    const { fileData, filename } = req.body

    if (!fileData) {
      return res.status(400).json({ error: 'Nessun file fornito' })
    }

    // Placeholder - implementa upload reale
    const result = {
      success: true,
      filename: filename || 'unknown',
      size: fileData.length,
      uploadedAt: new Date().toISOString()
    }

    return res.status(200).json(result)
  } catch (error) {
    console.error('Upload error:', error)
    return res.status(500).json({ error: 'Errore upload' })
  }
}

export const config = {
  api: {
    bodyParser: true,
    responseLimit: '8mb'
  }
}
