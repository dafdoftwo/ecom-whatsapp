import { NextRequest, NextResponse } from 'next/server';
import { PhoneProcessor } from '@/lib/services/phone-processor';
import { WhatsAppService } from '@/lib/services/whatsapp';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phoneNumber, whatsappNumber, batch } = body;

    // Single number analysis
    if (!batch && (phoneNumber || whatsappNumber)) {
      const targetNumber = whatsappNumber || phoneNumber;
      
      const analysis = PhoneProcessor.analyzePhoneNumber(targetNumber);
      const egyptianValidation = PhoneProcessor.validateEgyptianNumber(targetNumber);
      
      let whatsappValidation = null;
      const whatsapp = WhatsAppService.getInstance();
      if (whatsapp.getStatus().isConnected && egyptianValidation.isValid) {
        whatsappValidation = await whatsapp.validatePhoneNumber(egyptianValidation.finalFormat);
      }

      // If both numbers provided, compare them
      let dualAnalysis = null;
      if (phoneNumber && whatsappNumber) {
        dualAnalysis = PhoneProcessor.processTwoNumbers(phoneNumber, whatsappNumber);
      }

      return NextResponse.json({
        type: 'single',
        analysis,
        egyptianValidation,
        whatsappValidation,
        dualAnalysis,
        recommendations: generateEgyptianRecommendations(analysis, egyptianValidation, whatsappValidation)
      });
    }

    // Batch analysis
    if (batch && Array.isArray(batch)) {
      const results = [];
      let validEgyptianCount = 0;
      let whatsappRegisteredCount = 0;
      let invalidCount = 0;

      const whatsapp = WhatsAppService.getInstance();
      const isWhatsAppConnected = whatsapp.getStatus().isConnected;

      for (const item of batch.slice(0, 50)) { // Limit to 50 for performance
        const { phoneNumber, whatsappNumber, name, orderId } = item;
        
        const processing = PhoneProcessor.processTwoNumbers(phoneNumber || '', whatsappNumber || '');
        let egyptianValidation = null;
        let whatsappValidation = null;

        if (processing.isValid) {
          egyptianValidation = PhoneProcessor.validateEgyptianNumber(processing.preferredNumber);
          
          if (egyptianValidation.isValid) {
            validEgyptianCount++;
            
            if (isWhatsAppConnected) {
              whatsappValidation = await whatsapp.validatePhoneNumber(egyptianValidation.finalFormat);
              if (whatsappValidation.isRegistered) {
                whatsappRegisteredCount++;
              }
            }
          }
        } else {
          invalidCount++;
        }

        results.push({
          name: name || 'غير محدد',
          orderId: orderId || 'غير محدد',
          originalPhone: phoneNumber || '',
          originalWhatsApp: whatsappNumber || '',
          processing,
          egyptianValidation,
          whatsappValidation,
          status: getOverallStatus(processing, egyptianValidation, whatsappValidation)
        });
      }

      return NextResponse.json({
        type: 'batch',
        summary: {
          total: results.length,
          validEgyptian: validEgyptianCount,
          whatsappRegistered: whatsappRegisteredCount,
          invalid: invalidCount,
          validPercentage: Math.round((validEgyptianCount / results.length) * 100),
          whatsappPercentage: Math.round((whatsappRegisteredCount / results.length) * 100)
        },
        results,
        recommendations: generateBatchRecommendations(validEgyptianCount, whatsappRegisteredCount, invalidCount, results.length)
      });
    }

    return NextResponse.json(
      { error: 'يرجى تقديم رقم هاتف واحد أو مجموعة أرقام للتحليل' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error analyzing Egyptian phone numbers:', error);
    return NextResponse.json(
      { error: 'فشل في تحليل أرقام الهاتف المصرية' },
      { status: 500 }
    );
  }
}

function generateEgyptianRecommendations(
  analysis: ReturnType<typeof PhoneProcessor.analyzePhoneNumber>,
  egyptianValidation: ReturnType<typeof PhoneProcessor.validateEgyptianNumber>,
  whatsappValidation: any
): string[] {
  const recommendations: string[] = [];

  if (!analysis.isValid) {
    recommendations.push('❌ الرقم غير صالح - يرجى التحقق من التنسيق');
    
    if (analysis.suggestions.length > 0) {
      recommendations.push(...analysis.suggestions);
    }
    return recommendations;
  }

  if (!analysis.isEgyptian) {
    recommendations.push('⚠️ الرقم ليس مصري - قد لا يعمل مع العروض المحلية');
    return recommendations;
  }

  if (!egyptianValidation.isValid) {
    recommendations.push('❌ الرقم لا يتوافق مع معايير الأرقام المصرية');
    recommendations.push(...egyptianValidation.errors.map(error => `• ${error}`));
    return recommendations;
  }

  recommendations.push('✅ رقم مصري صحيح');
  recommendations.push(`📱 التنسيق النهائي: ${egyptianValidation.finalFormat}`);

  if (whatsappValidation) {
    if (whatsappValidation.isRegistered) {
      recommendations.push('✅ الرقم مسجل على الواتساب - جاهز للإرسال');
    } else {
      recommendations.push('❌ الرقم غير مسجل على الواتساب');
      recommendations.push('💡 تأكد من أن صاحب الرقم لديه حساب واتساب نشط');
    }
  } else {
    recommendations.push('⚠️ لا يمكن التحقق من تسجيل الواتساب (اتصال الواتساب غير متاح)');
  }

  return recommendations;
}

function generateBatchRecommendations(
  validEgyptian: number,
  whatsappRegistered: number,
  invalid: number,
  total: number
): string[] {
  const recommendations: string[] = [];
  const validPercentage = (validEgyptian / total) * 100;
  const whatsappPercentage = (whatsappRegistered / total) * 100;

  recommendations.push(`📊 تم تحليل ${total} رقم هاتف`);
  
  if (validPercentage >= 80) {
    recommendations.push('✅ جودة ممتازة - معظم الأرقام صالحة');
  } else if (validPercentage >= 60) {
    recommendations.push('⚠️ جودة جيدة - يمكن تحسين بعض الأرقام');
  } else {
    recommendations.push('❌ جودة ضعيفة - يحتاج تنظيف كبير للبيانات');
  }

  if (whatsappPercentage >= 70) {
    recommendations.push('📱 معظم الأرقام مسجلة على الواتساب - ممتاز للحملات');
  } else if (whatsappPercentage >= 40) {
    recommendations.push('📱 نسبة جيدة من الأرقام على الواتساب');
  } else {
    recommendations.push('📱 نسبة قليلة من الأرقام على الواتساب - قد تحتاج مصادر أخرى');
  }

  if (invalid > 0) {
    recommendations.push(`🔧 يحتاج ${invalid} رقم لإصلاح أو حذف`);
  }

  return recommendations;
}

function getOverallStatus(
  processing: ReturnType<typeof PhoneProcessor.processTwoNumbers>,
  egyptianValidation: ReturnType<typeof PhoneProcessor.validateEgyptianNumber> | null,
  whatsappValidation: any
): 'excellent' | 'good' | 'warning' | 'error' {
  if (!processing.isValid) return 'error';
  if (!egyptianValidation?.isValid) return 'error';
  if (whatsappValidation && !whatsappValidation.isRegistered) return 'warning';
  if (whatsappValidation && whatsappValidation.isRegistered) return 'excellent';
  return 'good';
} 