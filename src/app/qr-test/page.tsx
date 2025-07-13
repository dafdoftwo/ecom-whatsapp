'use client';

import React, { useState } from 'react';

export default function QRTestPage() {
  const [qrData, setQrData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initializeWhatsApp = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/whatsapp/init-persistent', {
        method: 'POST'
      });
      
      const data = await response.json();
      setQrData(data);
      
      if (!data.success) {
        setError(data.error || 'Failed to initialize');
      }
    } catch (err) {
      setError('Network error');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const testQRGeneration = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/whatsapp/test-qr');
      const data = await response.json();
      setQrData(data);
      
      if (!data.success) {
        setError(data.error || 'Failed to generate QR');
      }
    } catch (err) {
      setError('Network error');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/whatsapp/persistent-connection');
      const data = await response.json();
      setQrData(data);
      
      if (!data.success) {
        setError(data.error || 'Failed to get status');
      }
    } catch (err) {
      setError('Network error');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">QR Code Test Page</h1>
      
      <div className="space-y-4 mb-6">
        <button
          onClick={initializeWhatsApp}
          disabled={loading}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Initialize WhatsApp'}
        </button>
        
        <button
          onClick={testQRGeneration}
          disabled={loading}
          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50 ml-2"
        >
          {loading ? 'Loading...' : 'Test QR Generation'}
        </button>
        
        <button
          onClick={checkStatus}
          disabled={loading}
          className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 disabled:opacity-50 ml-2"
        >
          {loading ? 'Loading...' : 'Check Status'}
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <strong>Error:</strong> {error}
        </div>
      )}

      {qrData && (
        <div className="bg-gray-100 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Response Data:</h2>
          
          {/* QR Code Display */}
          {qrData.qrCode && (
            <div className="mb-4">
              <h3 className="text-lg font-medium mb-2">QR Code:</h3>
              <div className="border-2 border-gray-300 p-4 rounded-lg bg-white inline-block">
                <img 
                  src={qrData.qrCode} 
                  alt="WhatsApp QR Code" 
                  className="max-w-xs"
                  onError={(e) => {
                    console.error('QR Code image failed to load');
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            </div>
          )}
          
          {/* Connection Status */}
          {qrData.connection && (
            <div className="mb-4">
              <h3 className="text-lg font-medium mb-2">Connection Status:</h3>
              <div className="bg-white p-3 rounded border">
                <p><strong>Connected:</strong> {qrData.connection.isConnected ? 'Yes' : 'No'}</p>
                <p><strong>Quality:</strong> {qrData.connection.quality}</p>
                <p><strong>Uptime:</strong> {qrData.connection.uptime}</p>
                {qrData.connection.clientInfo && (
                  <p><strong>Client:</strong> {qrData.connection.clientInfo.pushname}</p>
                )}
              </div>
            </div>
          )}
          
          {/* Raw JSON */}
          <details className="mt-4">
            <summary className="cursor-pointer font-medium">Raw JSON Response</summary>
            <pre className="bg-gray-800 text-green-400 p-4 rounded mt-2 overflow-auto text-sm">
              {JSON.stringify(qrData, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
} 