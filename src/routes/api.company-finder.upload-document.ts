import { createFileRoute } from "@tanstack/react-router";

export async function POST(request: Request): Promise<Response> {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return new Response(JSON.stringify({ error: 'Nessun file fornito' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    // Processa il documento (placeholder)
    const result = {
      success: true,
      filename: file.name,
      size: buffer.length,
      type: file.type
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Upload error:', error)
    return new Response(JSON.stringify({ error: 'Errore upload' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

export const Route = createFileRoute("/api/company-finder/upload-document")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => POST(request),
    },
  },
});
