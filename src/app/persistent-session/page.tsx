import PersistentSessionManager from '@/components/PersistentSessionManager';

export default function PersistentSessionPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">إدارة الجلسات الدائمة</h1>
          <p className="text-gray-600">
            نظام إدارة جلسات الواتساب الاحترافي مع النسخ الاحتياطي التلقائي والحفظ الدائم
          </p>
        </div>
        
        <PersistentSessionManager 
          autoInitialize={true}
          onConnectionSuccess={() => {
            console.log('WhatsApp connected successfully!');
          }}
        />
      </div>
    </div>
  );
} 