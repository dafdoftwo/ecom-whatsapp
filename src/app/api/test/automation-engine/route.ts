import { NextResponse } from 'next/server';
import { AutomationEngine } from '@/lib/services/automation-engine';
import { ConfigService } from '@/lib/services/config';

export async function GET() {
  try {
    console.log('🧪 Testing automation engine with fixed templates...');
    
    // Test 1: Check templates configuration
    const templatesConfig = await ConfigService.getMessageTemplates();
    console.log('📋 Templates config structure:', Object.keys(templatesConfig));
    console.log('📋 Templates object:', Object.keys(templatesConfig.templates || {}));
    
    // Test 2: Check if automation engine can process templates
    const templates = templatesConfig.templates;
    if (!templates) {
      throw new Error('Templates not found in configuration');
    }
    
    // Test 3: Test message variable replacement
    const testRow = {
      name: 'احمد محمد',
      orderId: 'TEST-001',
      phone: '01234567890',
      processedPhone: '201234567890',
      productName: 'منتج تجريبي',
      totalPrice: 100,
      orderStatus: 'جديد',
      rowIndex: 1
    };
    
    // Test newOrder template
    let testMessage = '';
    try {
      // Use the public testing method
      testMessage = AutomationEngine.testMessageReplacement(templates.newOrder, testRow);
      console.log('✅ Template replacement successful');
      console.log('📝 Test message preview:', testMessage.substring(0, 100) + '...');
    } catch (error) {
      console.error('❌ Template replacement failed:', error);
      throw error;
    }
    
    // Test 4: Check automation engine status
    const engineStatus = AutomationEngine.getStatus();
    
    return NextResponse.json({
      success: true,
      message: 'Automation engine test completed successfully',
      tests: {
        templatesStructure: {
          hasTemplatesProperty: !!templatesConfig.templates,
          templateKeys: Object.keys(templatesConfig.templates || {}),
          newOrderTemplate: templates.newOrder ? 'Available' : 'Missing'
        },
        messageReplacement: {
          success: !!testMessage,
          messageLength: testMessage.length,
          preview: testMessage.substring(0, 100) + '...'
        },
        engineStatus: {
          isRunning: engineStatus.isRunning,
          performance: engineStatus.performance
        }
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Automation engine test failed:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Automation engine test failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 