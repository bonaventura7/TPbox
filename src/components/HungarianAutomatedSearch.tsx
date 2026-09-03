'use client';

import { useState, useEffect } from 'react';
import { HungarianDocumentUpload } from './HungarianDocumentUpload';
import { DocumentViewer } from './DocumentViewer';

interface Props {
  companyName: string;
}

export function HungarianAutomatedSearch({ companyName }: Props) {
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [uploadedDocumentId, setUploadedDocumentId] = useState<string | null>(null);

  const handleSearch = async () => {
    setSearching(true);
    try {
      const res = await fetch('/api/company-finder/hu/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName }),
      });
      setResult(await res.json());
    } catch (err) {
      setResult({ success: false, error: 'Errore connessione' });
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (companyName && companyName.length >= 3) {
      handleSearch();
    }
  }, [companyName]);

  if (searching) {
    return (
      <div className="text-center py-12">
        <svg className="animate-spin mx-auto h-16 w-16 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="mt-6 text-xl font-semibold">Ricerca automatizzata in corso...</p>
        <p className="text-sm text-gray-600 mt-2">L'agente sta consultando e-beszamolo</p>
      </div>
    );
  }

  if (result?.success) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="font-semibold text-green-800">✓ Società trovata</p>
          <p className="text-sm text-gray-700 mt-1">{result.companyName}</p>
        </div>
        {uploadedDocumentId ? (
          <DocumentViewer documentId={uploadedDocumentId} title={`Bilancio - ${result.companyName}`} />
        ) : (
          <HungarianDocumentUpload companyId={`HU-${result.companyId || 'unknown'}`} onDocumentUploaded={setUploadedDocumentId} />
        )}
      </div>
    );
  }

  if (result?.error) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="font-semibold text-red-800">✗ {result.error}</p>
          <p className="text-sm text-gray-600 mt-2">Ricerca automatizzata non disponibile</p>
        </div>
        <HungarianDocumentUpload companyId={`HU-${companyName.replace(/[^a-z0-9]/gi, '')}`} onDocumentUploaded={setUploadedDocumentId} />
      </div>
    );
  }

  return (
    <div className="text-center py-8">
      <button onClick={handleSearch} className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">
        Avvia ricerca automatizzata
      </button>
    </div>
  );
}
