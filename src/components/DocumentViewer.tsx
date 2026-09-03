'use client';

interface Props {
  documentId: string;
  title?: string;
}

export function DocumentViewer({ documentId, title = 'Documento aziendale' }: Props) {
  const documentUrl = `/api/company-finder/document/${documentId}`;

  return (
    <div className="border rounded-lg overflow-hidden shadow-sm">
      <div className="bg-gray-100 px-4 py-3 flex justify-between items-center border-b">
        <h4 className="font-semibold text-gray-800">{title}</h4>
        <a
          href={documentUrl}
          download
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium"
        >
          Scarica PDF
        </a>
      </div>
      <iframe
        src={documentUrl}
        className="w-full h-[600px]"
        title={title}
        style={{ border: 'none' }}
      />
    </div>
  );
}
