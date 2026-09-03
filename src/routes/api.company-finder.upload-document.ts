import { put } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const companyId = formData.get('companyId') as string | null;
    const documentType = (formData.get('documentType') as string) || 'annual-report';
    const year = (formData.get('year') as string) || new Date().getFullYear().toString();

    if (!file || !companyId) {
      return NextResponse.json(
        { error: 'File e companyId sono obbligatori', success: false },
        { status: 400 }
      );
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Solo file PDF sono accettati', success: false },
        { status: 400 }
      );
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'Il file non può superare i 10MB', success: false },
        { status: 400 }
      );
    }

    const documentId = crypto.randomUUID();
    const filename = `hu/${companyId}/${documentId}.pdf`;

    const blob = await put(filename, file, {
      access: 'private',
      contentType: 'application/pdf',
      addRandomSuffix: false,
    });

    console.log('[HU-UPLOAD] Documento caricato:', { documentId, companyId, filename });

    return NextResponse.json({
      success: true,
      documentId,
      url: `/api/company-finder/document/${documentId}`,
      metadata: { documentType, year, size: file.size },
    });
  } catch (error) {
    console.error('[HU-UPLOAD] Errore upload:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore interno', success: false },
      { status: 500 }
    );
  }
}