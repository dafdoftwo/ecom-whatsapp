import { NextRequest, NextResponse } from 'next/server';
import { ConfigService } from '@/lib/services/config';

export async function GET() {
  try {
    const config = await ConfigService.getMessageTemplates();
    return NextResponse.json(config.templates);
  } catch (error) {
    console.error('Error getting message templates:', error);
    return NextResponse.json(
      { error: 'Failed to get message templates' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const templates = await request.json();
    
    // Validate required template fields
    const requiredTemplates = ['newOrder', 'noAnswer', 'shipped', 'rejectedOffer', 'reminder'];
    const missingTemplates = requiredTemplates.filter(template => !templates[template]);
    
    if (missingTemplates.length > 0) {
      return NextResponse.json(
        { error: `Missing required templates: ${missingTemplates.join(', ')}` },
        { status: 400 }
      );
    }

    await ConfigService.setMessageTemplates(templates);
    return NextResponse.json({ success: true, message: 'Message templates saved successfully' });
  } catch (error) {
    console.error('Error saving message templates:', error);
    return NextResponse.json(
      { error: 'Failed to save message templates' },
      { status: 500 }
    );
  }
} 