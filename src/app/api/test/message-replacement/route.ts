import { NextResponse } from 'next/server';
import { AutomationEngine } from '@/lib/services/automation-engine';
import { ConfigService } from '@/lib/services/config';

export async function GET() {
  try {
    console.log('🧪 Testing message variable replacement...');
    
    // Get current message templates
    const templatesConfig = await ConfigService.getMessageTemplates();
    const templates = templatesConfig.templates;
    
    // Create test row data similar to what we get from Google Sheets
    const testRow = {
      name: 'هبه',
      orderId: 'TEST-001',
      phone: '01234567890',
      processedPhone: '201234567890',
      productName: 'موبايل المهام الخاصة k19',
      totalPrice: '1999',
      orderStatus: 'جديد',
      rowIndex: 1,
      governorate: 'الإسكندرية',
      address: 'الابراهيمية شارع الاندلس 25',
      orderDate: '2025-01-14',
      quantity: '1',
      notes: '',
      whatsappNumber: '',
      area: '',
      orderDetails: 'موبايل واحد بسعر ١٩٩٩ جنيه',
      source: '',
      sourceChannel: '',
      whatsappStatus: '',
      validPhone: true,
      lastMessageSent: '',
      lastUpdated: new Date().toISOString()
    };
    
    console.log('📋 Test data:', {
      name: testRow.name,
      productName: testRow.productName,
      orderId: testRow.orderId
    });
    
    // Test each message template
    const results = {
      newOrder: {
        template: templates.newOrder,
        result: AutomationEngine.testMessageReplacement(templates.newOrder, testRow),
        hasProductName: templates.newOrder.includes('{productName}'),
        productNameReplaced: false
      },
      noAnswer: {
        template: templates.noAnswer,
        result: AutomationEngine.testMessageReplacement(templates.noAnswer, testRow),
        hasProductName: templates.noAnswer.includes('{productName}'),
        productNameReplaced: false
      },
      shipped: {
        template: templates.shipped,
        result: AutomationEngine.testMessageReplacement(templates.shipped, testRow),
        hasProductName: templates.shipped.includes('{productName}'),
        productNameReplaced: false
      },
      rejectedOffer: {
        template: templates.rejectedOffer,
        result: AutomationEngine.testMessageReplacement(templates.rejectedOffer, testRow),
        hasProductName: templates.rejectedOffer.includes('{productName}'),
        productNameReplaced: false
      }
    };
    
    // Check if productName was actually replaced in each result
    Object.keys(results).forEach(key => {
      const result = results[key as keyof typeof results];
      result.productNameReplaced = !result.result.includes('{productName}') && result.result.includes(testRow.productName);
    });
    
    const summary = {
      testRowData: {
        name: testRow.name,
        productName: testRow.productName,
        orderId: testRow.orderId
      },
      templatesWithProductName: Object.keys(results).filter(key => results[key as keyof typeof results].hasProductName),
      successfulReplacements: Object.keys(results).filter(key => results[key as keyof typeof results].productNameReplaced),
      failedReplacements: Object.keys(results).filter(key => 
        results[key as keyof typeof results].hasProductName && !results[key as keyof typeof results].productNameReplaced
      )
    };
    
    console.log('✅ Message replacement test completed');
    console.log('📊 Summary:', summary);
    
    return NextResponse.json({
      success: true,
      message: 'Message replacement test completed',
      testData: testRow,
      results,
      summary,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Message replacement test failed:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Message replacement test failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 