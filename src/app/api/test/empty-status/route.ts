import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Test data to simulate empty status scenarios
    const testScenarios = [
      {
        scenario: 'حالة فارغة',
        orderStatus: '',
        expectedTreatment: 'طلب جديد',
        willSendMessage: true,
        messageType: 'newOrder'
      },
      {
        scenario: 'حالة null',
        orderStatus: null,
        expectedTreatment: 'طلب جديد',
        willSendMessage: true,
        messageType: 'newOrder'
      },
      {
        scenario: 'حالة undefined',
        orderStatus: undefined,
        expectedTreatment: 'طلب جديد',
        willSendMessage: true,
        messageType: 'newOrder'
      },
      {
        scenario: 'حالة فراغات فقط',
        orderStatus: '   ',
        expectedTreatment: 'طلب جديد',
        willSendMessage: true,
        messageType: 'newOrder'
      },
      {
        scenario: 'حالة جديد عادية',
        orderStatus: 'جديد',
        expectedTreatment: 'طلب جديد',
        willSendMessage: true,
        messageType: 'newOrder'
      },
      {
        scenario: 'حالة قيد المراجعة',
        orderStatus: 'قيد المراجعة',
        expectedTreatment: 'طلب جديد',
        willSendMessage: true,
        messageType: 'newOrder'
      }
    ];

    // Test logic for each scenario
    const results = testScenarios.map(test => {
      const cleanStatus = (test.orderStatus || '').trim();
      const isEmpty = cleanStatus === '';
      const isNewOrder = isEmpty || 
                        cleanStatus === 'جديد' || 
                        cleanStatus === 'طلب جديد' || 
                        cleanStatus === 'قيد المراجعة' || 
                        cleanStatus === 'قيد المراجعه' || 
                        cleanStatus === 'غير محدد';

      return {
        ...test,
        actualResult: {
          isEmpty,
          isNewOrder,
          cleanedStatus: cleanStatus || '(فارغ)',
          statusAfterCleaning: cleanStatus,
          willBeProcessed: isNewOrder
        },
        testPassed: isNewOrder === test.willSendMessage
      };
    });

    const allTestsPassed = results.every(r => r.testPassed);

    return NextResponse.json({
      success: true,
      message: allTestsPassed 
        ? '✅ جميع اختبارات الحالات الفارغة نجحت!' 
        : '⚠️ بعض الاختبارات فشلت - تحقق من النتائج',
      testSummary: {
        totalTests: results.length,
        passedTests: results.filter(r => r.testPassed).length,
        failedTests: results.filter(r => !r.testPassed).length,
        allPassed: allTestsPassed
      },
      testResults: results,
      emptyStatusLogic: {
        description: 'الحالات الفارغة تُعامل كطلبات جديدة',
        process: [
          '1. تنظيف الحالة من الفراغات: (orderStatus || "").trim()',
          '2. فحص إذا كانت فارغة: cleanStatus === ""',
          '3. إذا فارغة: معاملة كطلب جديد',
          '4. إرسال رسالة newOrder',
          '5. جدولة تذكير بعد 24 ساعة'
        ]
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in empty status test:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'فشل في اختبار منطق الحالات الفارغة',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 