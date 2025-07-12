import { NextResponse } from 'next/server';
import { GoogleSheetsService } from '@/lib/services/google-sheets';
import { ConfigService } from '@/lib/services/config';
import { PhoneProcessor } from '@/lib/services/phone-processor';
import { WhatsAppService } from '@/lib/services/whatsapp';

export async function GET() {
  try {
    console.log('🧪 Running test processing to see what messages would be sent...');
    
    // Get sheet data
    const sheetData = await GoogleSheetsService.getSheetData();
    
    if (!sheetData || sheetData.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No data found in Google Sheets',
        orders: []
      });
    }
    
    // Get message templates
    const { templates } = await ConfigService.getMessageTemplates();
    
    // Get WhatsApp instance
    const whatsapp = WhatsAppService.getInstance();
    
    const processedOrders = [];
    
    for (const row of sheetData) {
      const orderInfo: any = {
        orderId: row.orderId,
        name: row.name,
        phone: row.phone,
        whatsappNumber: row.whatsappNumber,
        orderStatus: row.orderStatus,
        validPhone: false,
        processedPhone: null,
        messageToBeSent: null,
        messageType: null,
        whatsappRegistered: false,
        errors: []
      };
      
      // Phone validation
      if (!row.name || (!row.phone && !row.whatsappNumber)) {
        orderInfo.errors.push('Missing name or phone number');
        processedOrders.push(orderInfo);
        continue;
      }
      
      // Process phone number
      const phoneProcessing = PhoneProcessor.processTwoNumbers(row.phone, row.whatsappNumber);
      
      if (!phoneProcessing.isValid) {
        orderInfo.errors.push('Invalid phone number');
        orderInfo.errors.push(...phoneProcessing.processingLog);
        processedOrders.push(orderInfo);
        continue;
      }
      
      // Egyptian validation
      const egyptianValidation = PhoneProcessor.validateEgyptianNumber(phoneProcessing.preferredNumber);
      
      if (!egyptianValidation.isValid) {
        orderInfo.errors.push('Not a valid Egyptian number');
        orderInfo.errors.push(...egyptianValidation.errors);
        processedOrders.push(orderInfo);
        continue;
      }
      
      orderInfo.validPhone = true;
      orderInfo.processedPhone = egyptianValidation.finalFormat;
      
      // Check WhatsApp registration (if connected)
      const whatsappStatus = whatsapp.getStatus();
      
      if (whatsappStatus.isConnected) {
        try {
          const validation = await whatsapp.validatePhoneNumber(orderInfo.processedPhone);
          orderInfo.whatsappRegistered = validation.isRegistered;
          if (!validation.isRegistered) {
            orderInfo.errors.push('Phone not registered on WhatsApp');
          }
        } catch (error) {
          orderInfo.errors.push('Could not validate WhatsApp registration');
        }
      } else {
        orderInfo.whatsappRegistered = 'unknown';
        orderInfo.errors.push('WhatsApp not connected - cannot validate registration');
      }
      
      // Determine message type based on status
      const status = (row.orderStatus || '').trim();
      
      switch (status) {
        case '':
        case 'جديد':
        case 'طلب جديد':
        case 'قيد المراجعة':
        case 'قيد المراجعه':
        case 'غير محدد':
          orderInfo.messageType = 'newOrder';
          orderInfo.messageToBeSent = templates.newOrder
            .replace(/{name}/g, row.name)
            .replace(/{orderId}/g, row.orderId || 'N/A')
            .replace(/{amount}/g, row.totalPrice?.toString() || '0')
            .replace(/{productName}/g, row.productName || 'المنتج');
          break;
          
        case 'لم يتم الرد':
        case 'لم يرد':
        case 'لا يرد':
        case 'عدم الرد':
          orderInfo.messageType = 'noAnswer';
          orderInfo.messageToBeSent = templates.noAnswer
            .replace(/{name}/g, row.name)
            .replace(/{orderId}/g, row.orderId || 'N/A');
          break;
          
        case 'تم التأكيد':
        case 'تم التاكيد':
        case 'مؤكد':
        case 'تم الشحن':
        case 'قيد الشحن':
          orderInfo.messageType = 'shipped';
          orderInfo.messageToBeSent = templates.shipped
            .replace(/{name}/g, row.name)
            .replace(/{orderId}/g, row.orderId || 'N/A')
            .replace(/{trackingNumber}/g, `TRK${row.orderId || Date.now()}`);
          break;
          
        case 'تم الرفض':
        case 'مرفوض':
        case 'رفض الاستلام':
        case 'رفض الأستلام':
        case 'لم يتم الاستلام':
          orderInfo.messageType = 'rejectedOffer (scheduled for 24h later)';
          orderInfo.messageToBeSent = templates.rejectedOffer
            .replace(/{name}/g, row.name)
            .replace(/{orderId}/g, row.orderId || 'N/A')
            .replace(/{discountedAmount}/g, Math.round(parseFloat(row.totalPrice?.toString() || '0') * 0.8).toString());
          break;
          
        default:
          orderInfo.messageType = 'none';
          orderInfo.messageToBeSent = 'No message for this status';
          orderInfo.errors.push(`Unknown status: ${status}`);
      }
      
      processedOrders.push(orderInfo);
    }
    
    // Summary
    const summary = {
      totalOrders: processedOrders.length,
      validPhones: processedOrders.filter(o => o.validPhone).length,
      invalidPhones: processedOrders.filter(o => !o.validPhone).length,
      messagesToSend: {
        newOrder: processedOrders.filter(o => o.messageType === 'newOrder').length,
        noAnswer: processedOrders.filter(o => o.messageType === 'noAnswer').length,
        shipped: processedOrders.filter(o => o.messageType === 'shipped').length,
        rejectedOffer: processedOrders.filter(o => o.messageType?.includes('rejectedOffer')).length,
        none: processedOrders.filter(o => o.messageType === 'none').length
      }
    };
    
    return NextResponse.json({
      success: true,
      summary,
      whatsappConnected: whatsapp.getStatus().isConnected,
      orders: processedOrders
    });
    
  } catch (error) {
    console.error('❌ Test processing failed:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Test processing failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 