import { NextRequest, NextResponse } from 'next/server';
import { getHuAgent } from '@/lib/company-finder/hu-browser-agent';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { companyName } = body as { companyName: string };

  if (!companyName || companyName.length < 3) {
    return NextResponse.json(
      { error: 'companyName obbligatorio (min 3 char)', success: false },
      { status: 400 }
    );
  }

  const agent = getHuAgent();
  const result = await agent.searchCompany(companyName);

  if (result.success) {
    return NextResponse.json({
      success: true,
      companyId: result.companyId,
      companyName: result.companyName,
      documentUrl: result.documentUrl,
    });
  }

  return NextResponse.json(
    { error: result.error, success: false },
    { status: 404 }
  );
}
