import { createFileRoute } from "@tanstack/react-router";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json()
    const { companyName, taxId, country } = body

    // Placeholder per ricerca Hungary
    const result = {
      success: true,
      query: { companyName, taxId, country },
      message: 'Ricerca Hungary implementata'
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Search error:', error)
    return new Response(JSON.stringify({ error: 'Errore ricerca' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

export const Route = createFileRoute("/api/company-finder/hu/search")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => POST(request),
    },
  },
});
