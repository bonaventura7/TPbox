'use client';

import { useState, useRef } from 'react';

interface Props {
  companyId: string;
  onDocumentUploaded: (documentId: string) => void;
}

export function HungarianDocumentUpload({ companyId, onDocumentUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    await uploadFile(file);
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('companyId', companyId);
    formData.append('documentType', 'annual-report');
    formData.append('year', new Date().getFullYear().toString());

    try {
      const response = await fetch('/api/company-finder/upload-document', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload fallito');
      }

      setSuccess(true);
      onDocumentUploaded(data.documentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore durante l\'upload');
    } finally {
      setUploading(false);
    }
  };

  const openPortalInNewTab = () => {
    window.open('https://e-beszamolo.im.gov.hu/oldal/beszamolo_kereses', '_blank');
  };

  return (
    <div className="border rounded-lg p-6 bg-gray-50">
      <h3 className="text-lg font-semibold mb-4">
        Documenti ungheresi — Procedura guidata
      </h3>

      <ol className="space-y-3 mb-6 text-sm text-gray-700">
        <li>
          <button
            onClick={openPortalInNewTab}
            className="text-blue-600 hover:underline font-medium"
          >
            Clicca qui per aprire il registro ufficiale
          </button>
          {' '}<span className="text-gray-500">(si apre in una nuova scheda)</span>
        </li>
        <li>Inserisci il nome della società nel campo di ricerca</li>
        <li>Seleziona la società corretta dall'elenco</li>
        <li>Clicca sul documento dell'esercizio desiderato</li>
        <li>Scarica il PDF sul tuo computer</li>
        <li className="font-semibold">
          <strong>Trascina il PDF qui sotto</strong> per caricarlo
        </li>
      </ol>

      {success ? (
        <div className="border-2 border-green-500 bg-green-50 rounded-lg p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="mt-2 text-green-700 font-medium">Documento caricato con successo!</p>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${uploading ? 'border-gray-300 bg-gray-100' : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'}
          `}
        >
          {uploading ? (
            <div className="text-gray-500">
              <svg className="mx-auto h-12 w-12 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="mt-2">Upload in corso...</p>
            </div>
          ) : error ? (
            <div>
              <svg className="mx-auto h-12 w-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <p className="mt-2 text-red-600 font-medium">{error}</p>
            </div>
          ) : (
            <div className="text-gray-600">
              <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="mt-2 font-medium">Trascina il PDF qui oppure clicca per selezionare</p>
              <p className="text-sm text-gray-500 mt-1">Formato: PDF (max 10MB)</p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileInput}
            className="hidden"
            disabled={uploading}
          />
        </div>
      )}
    </div>
  );
}
