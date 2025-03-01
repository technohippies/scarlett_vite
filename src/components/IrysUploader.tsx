import React, { useState } from 'react';
import irysHelper from '../utils/irysHelper';

const IrysUploader: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [txId, setTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const uploadFile = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setUploading(true);
    setError(null);
    
    try {
      // Initialize Irys environment
      irysHelper.initIrysEnvironment();
      
      // Read file as buffer
      const buffer = await file.arrayBuffer();
      const fileBuffer = irysHelper.toBuffer(new Uint8Array(buffer));
      
      // Add tags
      const tags = [
        { name: 'Content-Type', value: file.type },
        { name: 'App-Name', value: 'Scarlett Tutor' },
        { name: 'File-Name', value: file.name }
      ];
      
      // Upload to Irys
      const id = await irysHelper.uploadToIrys(fileBuffer, tags);
      setTxId(id);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg">
      <h2 className="text-xl font-bold mb-4">Irys Uploader</h2>
      
      <div className="mb-4">
        <input 
          type="file" 
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500
            file:mr-4 file:py-2 file:px-4
            file:rounded-full file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100"
        />
      </div>
      
      {file && (
        <div className="mb-4">
          <p>Selected file: {file.name} ({Math.round(file.size / 1024)} KB)</p>
        </div>
      )}
      
      <button
        onClick={uploadFile}
        disabled={!file || uploading}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
      >
        {uploading ? 'Uploading...' : 'Upload to Irys'}
      </button>
      
      {error && (
        <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}
      
      {txId && (
        <div className="mt-4 p-3 bg-green-100 text-green-700 rounded-lg">
          <p>Upload successful!</p>
          <p className="text-sm break-all">Transaction ID: {txId}</p>
          <p className="text-sm mt-2">
            <a 
              href={`https://gateway.irys.xyz/${txId}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              View file
            </a>
          </p>
        </div>
      )}
    </div>
  );
};

export default IrysUploader; 