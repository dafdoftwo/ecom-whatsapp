import { NextRequest, NextResponse } from 'next/server';
import { GoogleSheetsService } from '@/lib/services/google-sheets';
import { PhoneProcessor } from '@/lib/services/phone-processor';
import { WhatsAppService } from '@/lib/services/whatsapp';
import { FormulaPhoneExtractor } from '@/lib/services/formula-phone-extractor';

// Helper function to fix #ERROR! formulas - Enhanced version with formula extraction
function fixErrorFormula(value: string): string {
  if (!value || typeof value !== 'string') {
    return '';
  }

  // Handle #ERROR! cases with comprehensive extraction
  if (value.includes('#ERROR!')) {
    console.log(`🔧 Fixing ERROR formula: "${value}"`);
    
    // First, try the specialized formula extractor
    const formulaExtracted = FormulaPhoneExtractor.forceExtractPhone(value);
    if (formulaExtracted) {
      console.log(`✅ Formula extractor success: ${formulaExtracted}`);
      return formulaExtracted;
    }
    
    // Enhanced patterns to extract phone numbers from error strings
    const patterns = [
      /(?:^|[^\d])(\d{11})(?:[^\d]|$)/g,         // 11 digit numbers with boundaries
      /(?:^|[^\d])(01\d{9})(?:[^\d]|$)/g,       // Egyptian mobile pattern
      /(?:^|[^\d])(\+201\d{9})(?:[^\d]|$)/g,    // International Egyptian
      /(?:^|[^\d])(\d{10})(?:[^\d]|$)/g,        // 10 digit numbers with boundaries
      /(?:^|[^\d])(2\d{10})(?:[^\d]|$)/g,       // Numbers starting with 2 (Egypt)
      /\d{8,15}/g                               // Fallback: any sequence of 8-15 digits
    ];
    
    for (const pattern of patterns) {
      const matches = [...value.matchAll(pattern)];
      if (matches.length > 0) {
        // Get the captured group (the number without boundaries)
        const extractedNumber = matches[0][1] || matches[0][0];
        console.log(`✅ Extracted number from ERROR: ${extractedNumber}`);
        return extractedNumber;
      }
    }
    
    console.log(`❌ Could not extract number from ERROR: "${value}"`);
    return '';
  }

  // Clean other common issues
  return value
    .replace(/[^\d+\s()-]/g, '') // Remove non-phone characters
    .replace(/\s+/g, '')         // Remove all spaces
    .trim();
}

// Helper function to clean text
function cleanText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    .replace(/[#ERROR!]+/g, '') // Remove error markers
    .replace(/Formula parse error\.?/gi, '') // Remove error messages
    .trim();
}

export async function GET(request: NextRequest) {
  try {
    console.log('🔄 Starting processed orders data retrieval...');
    
    // Get processed sheet data that already includes fixed phone numbers
    const rawSheetData = await GoogleSheetsService.getSheetData();
    
    if (!rawSheetData || rawSheetData.length === 0) {
      return NextResponse.json({
        success: true,
        orders: [],
        stats: {
          total: 0,
          valid: 0,
          invalid: 0,
          withErrors: 0,
          egyptian: 0,
          whatsappRegistered: 0,
          messagesSent: 0
        },
        message: 'No data found in Google Sheets'
      });
    }

    console.log(`📊 Processing ${rawSheetData.length} raw orders - NEVER SKIP ANY ORDER...`);

    const processedOrders = [];
    const whatsapp = WhatsAppService.getInstance();

    // Process ALL orders without skipping any
    for (const row of rawSheetData) {
      try {
        // Extract basic data - NEVER skip
        const customerName = cleanText(row.name || `عميل غير محدد - صف ${row.rowIndex}`);
        const productName = cleanText(row.productName || 'منتج غير محدد');
        const productValue = cleanText(row.totalPrice?.toString() || '0');
        const orderStatus = cleanText(row.orderStatus || 'غير محدد');

        // Use the pre-processed phone from GoogleSheetsService
        let processedPhone = row.processedPhone || 'رقم غير صالح';
        let phoneIsValid = row.validPhone || false;
        
        // If the pre-processing didn't work, try our enhanced formula extraction
        if (!phoneIsValid && (row.phone?.includes('#ERROR!') || row.whatsappNumber?.includes('#ERROR!'))) {
          console.log(`🔧 Pre-processing failed, trying enhanced extraction for row ${row.rowIndex}`);
          
          const primaryPhone = fixErrorFormula(row.phone || '');
          const secondaryPhone = fixErrorFormula(row.whatsappNumber || '');
          
          console.log(`🔍 Processing row ${row.rowIndex}: ${customerName}, Primary: "${row.phone}" -> "${primaryPhone}", Secondary: "${row.whatsappNumber}" -> "${secondaryPhone}"`);
          
          const phoneProcessing = PhoneProcessor.processTwoNumbers(primaryPhone, secondaryPhone);
          
          if (phoneProcessing.isValid && phoneProcessing.preferredNumber) {
            processedPhone = phoneProcessing.preferredNumber;
            phoneIsValid = true;
            console.log(`✅ Enhanced extraction success: ${processedPhone}`);
          }
        } else {
          console.log(`🔍 Using pre-processed data for row ${row.rowIndex}: ${customerName}, Phone: "${processedPhone}", Valid: ${phoneIsValid}`);
        }
        
        // Create phone validation object
        let phoneValidation = {
          isValid: phoneIsValid,
          isEgyptian: phoneIsValid,
          errors: phoneIsValid ? [] : ['No valid phone found'],
          originalFormat: row.phone || row.whatsappNumber || '',
          finalFormat: processedPhone
        };

        if (!phoneIsValid) {
          phoneValidation.errors = [
            `Original phone: "${row.phone || 'empty'}"`,
            `Original WhatsApp: "${row.whatsappNumber || 'empty'}"`,
            `Pre-processed result: "${row.processedPhone || 'none'}"`,
            row.validPhone === false ? 'Pre-processing marked as invalid' : 'No valid phone extracted'
          ];
        }

        // WhatsApp validation (only if phone is valid)
        let whatsappValidation = {
          isRegistered: false,
          isValid: false,
          error: phoneValidation.isValid ? 'WhatsApp not checked' : 'Phone number invalid'
        };

        if (phoneValidation.isValid && whatsapp.getStatus().isConnected) {
          try {
            const validation = await whatsapp.validatePhoneNumber(processedPhone);
            whatsappValidation = {
              isRegistered: validation.isRegistered,
              isValid: validation.isValid,
              error: validation.error || 'No error message'
            };
          } catch (error) {
            whatsappValidation = {
              isRegistered: false,
              isValid: false,
              error: `WhatsApp validation failed: ${error}`
            };
          }
        }

        // Mock sent messages based on status
        const sentMessages = [];
        if (phoneValidation.isValid) {
          const now = new Date().toISOString();
          if (['جديد', 'طلب جديد', 'قيد المراجعة', ''].includes(orderStatus)) {
            sentMessages.push({ type: 'newOrder', timestamp: now, status: 'sent' });
          }
          if (['لم يتم الرد', 'لم يرد', 'لا يرد'].includes(orderStatus)) {
            sentMessages.push({ type: 'noAnswer', timestamp: now, status: 'sent' });
          }
          if (['تم التأكيد', 'تم الشحن'].includes(orderStatus)) {
            sentMessages.push({ type: 'shipped', timestamp: now, status: 'sent' });
          }
          if (['تم الرفض', 'مرفوض', 'رفض الاستلام'].includes(orderStatus)) {
            sentMessages.push({ type: 'rejectedOffer', timestamp: now, status: 'pending' });
          }
        }

        // ALWAYS create order entry - NEVER SKIP
        const processedOrder = {
          rowIndex: row.rowIndex || 0,
          customerName,
          primaryPhone: row.phone || '',
          secondaryPhone: row.whatsappNumber || '',
          whatsappNumber: row.whatsappNumber || '',
          productName,
          productValue,
          orderStatus,
          processedPhone,
          phoneValidation,
          whatsappValidation,
          sentMessages,
          lastUpdate: new Date().toISOString(),
          orderDate: row.orderDate,
          governorate: row.governorate,
          area: row.area,
          address: row.address
        };

        processedOrders.push(processedOrder);
        console.log(`✅ Added order for row ${row.rowIndex}: ${customerName} - Phone valid: ${phoneValidation.isValid}`);

      } catch (error) {
        console.error(`❌ Error processing row ${row.rowIndex}:`, error);
        
        // Even if there's an error, create a basic order entry
        const errorOrder = {
          rowIndex: row.rowIndex || 0,
          customerName: cleanText(row.name || `خطأ - صف ${row.rowIndex}`),
          primaryPhone: row.phone || '',
          secondaryPhone: row.whatsappNumber || '',
          whatsappNumber: row.whatsappNumber || '',
          productName: cleanText(row.productName || 'خطأ في المنتج'),
          productValue: cleanText(row.totalPrice?.toString() || '0'),
          orderStatus: cleanText(row.orderStatus || 'خطأ'),
          processedPhone: 'خطأ في المعالجة',
          phoneValidation: {
            isValid: false,
            isEgyptian: false,
            errors: [`Processing error: ${error}`],
            originalFormat: row.phone || row.whatsappNumber || '',
            finalFormat: ''
          },
          whatsappValidation: {
            isRegistered: false,
            isValid: false,
            error: 'Processing failed'
          },
          sentMessages: [],
          lastUpdate: new Date().toISOString(),
          orderDate: row.orderDate,
          governorate: row.governorate,
          area: row.area,
          address: row.address
        };
        
        processedOrders.push(errorOrder);
        console.log(`⚠️ Added error order for row ${row.rowIndex}`);
      }
    }

    // Calculate statistics
    const stats = {
      total: processedOrders.length,
      valid: processedOrders.filter(o => o.phoneValidation.isValid).length,
      invalid: processedOrders.filter(o => !o.phoneValidation.isValid).length,
      withErrors: processedOrders.filter(o => 
        o.primaryPhone.includes('#ERROR!') || 
        o.secondaryPhone.includes('#ERROR!') ||
        o.phoneValidation.errors.some((e: string) => e.includes('ERROR'))
      ).length,
      egyptian: processedOrders.filter(o => o.phoneValidation.isEgyptian).length,
      whatsappRegistered: processedOrders.filter(o => o.whatsappValidation.isRegistered).length,
      messagesSent: processedOrders.reduce((sum, o) => sum + o.sentMessages.filter((m: any) => m.status === 'sent').length, 0)
    };
    
    console.log(`✅ Successfully processed ALL ${processedOrders.length} orders (${stats.valid} valid, ${stats.invalid} invalid, ${stats.withErrors} with errors)`);

    return NextResponse.json({
      success: true,
      orders: processedOrders,
      stats,
      lastUpdate: new Date().toISOString(),
      message: `Successfully processed ALL ${processedOrders.length} orders - no orders skipped`
    });

  } catch (error) {
    console.error('❌ Error processing orders:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to process orders',
      details: error instanceof Error ? error.message : 'Unknown error',
      orders: [],
      stats: {
        total: 0,
        valid: 0,
        invalid: 0,
        withErrors: 0,
        egyptian: 0,
        whatsappRegistered: 0,
        messagesSent: 0
      }
    }, { status: 500 });
  }
} 