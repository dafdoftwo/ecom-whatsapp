import { NextRequest, NextResponse } from 'next/server';
import { PhoneProcessor } from '@/lib/services/phone-processor';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phoneNumber, whatsappNumber } = body;

    if (!phoneNumber && !whatsappNumber) {
      return NextResponse.json(
        { error: 'Phone number or WhatsApp number is required' },
        { status: 400 }
      );
    }

    const analysis = PhoneProcessor.analyzePhoneNumber(phoneNumber || whatsappNumber);
    
    // If both numbers are provided, also process them together
    let dualAnalysis = null;
    if (phoneNumber && whatsappNumber) {
      dualAnalysis = PhoneProcessor.processTwoNumbers(phoneNumber, whatsappNumber);
    }

    return NextResponse.json({
      analysis,
      dualAnalysis,
      recommendations: generateRecommendations(analysis)
    });
  } catch (error) {
    console.error('Error analyzing phone number:', error);
    return NextResponse.json(
      { error: 'Failed to analyze phone number' },
      { status: 500 }
    );
  }
}

function generateRecommendations(analysis: ReturnType<typeof PhoneProcessor.analyzePhoneNumber>): string[] {
  const recommendations: string[] = [];

  if (!analysis.isValid) {
    if (analysis.validationErrors.includes('رقم فارغ')) {
      recommendations.push('يرجى إدخال رقم هاتف');
    }
    if (analysis.validationErrors.includes('تنسيق رقم غير صحيح')) {
      recommendations.push('تأكد من صحة تنسيق الرقم (أرقام فقط)');
    }
    if (analysis.validationErrors.includes('الرقم قصير جداً')) {
      recommendations.push('الرقم قصير، تأكد من إدخال الرقم كاملاً');
    }
    if (analysis.validationErrors.includes('الرقم طويل جداً')) {
      recommendations.push('الرقم طويل، تأكد من عدم وجود أرقام زائدة');
    }
  } else {
    recommendations.push('الرقم صالح ويمكن استخدامه');
    if (analysis.countryCode) {
      recommendations.push(`تم التعرف على البلد: ${analysis.countryName}`);
    }
  }

  return recommendations;
} 