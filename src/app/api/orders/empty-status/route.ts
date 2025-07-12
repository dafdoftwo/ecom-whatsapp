import { NextRequest, NextResponse } from 'next/server';
import { GoogleSheetsService } from '@/lib/services/google-sheets';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 API: Finding orders with empty status...');

    const result = await GoogleSheetsService.findEmptyStatusOrders();

    if (!result.success) {
      return NextResponse.json(
        { 
          success: false,
          error: result.error || 'فشل في البحث عن الطلبات ذات الحالة الفارغة'
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `تم العثور على ${result.totalCount} طلب بحالة فارغة`,
      data: {
        emptyOrders: result.emptyOrders,
        totalCount: result.totalCount,
        summary: {
          withValidPhone: result.emptyOrders.filter(order => order.validPhone).length,
          withInvalidPhone: result.emptyOrders.filter(order => !order.validPhone).length
        }
      }
    });

  } catch (error) {
    console.error('❌ Error in empty status API:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'خطأ في الخادم أثناء البحث عن الطلبات ذات الحالة الفارغة'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 API: Updating empty statuses to "جديد"...');

    const body = await request.json();
    const { action, rowIndex, newStatus } = body;

    if (action === 'update-all') {
      // تحديث جميع الحالات الفارغة إلى "جديد"
      const result = await GoogleSheetsService.updateEmptyStatusesToNew();

      if (!result.success) {
        return NextResponse.json(
          { 
            success: false,
            error: result.error || 'فشل في تحديث الحالات الفارغة'
          },
          { status: 500 }
        );
      }

      console.log(`✅ Successfully updated ${result.updatedRows} empty statuses`);

      return NextResponse.json({
        success: true,
        message: `تم تحديث ${result.updatedRows} طلب من الحالة الفارغة إلى "جديد" بنجاح! 🎉`,
        data: {
          updatedRows: result.updatedRows,
          details: result.details,
          summary: {
            totalUpdated: result.updatedRows,
            updateDetails: result.details.map(detail => ({
              customer: detail.customerName,
              row: detail.rowIndex,
              change: `"${detail.oldStatus || 'فارغ'}" → "${detail.newStatus}"`
            }))
          }
        }
      });

    } else if (action === 'update-single' && rowIndex && newStatus) {
      // تحديث طلب واحد
      const customerName = body.customerName;
      const result = await GoogleSheetsService.updateSingleOrderStatus(rowIndex, newStatus, customerName);

      if (!result.success) {
        return NextResponse.json(
          { 
            success: false,
            error: result.error || 'فشل في تحديث حالة الطلب'
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `تم تحديث حالة الطلب في الصف ${rowIndex} بنجاح!`,
        data: {
          rowIndex,
          oldStatus: result.oldStatus,
          newStatus: result.newStatus,
          customerName
        }
      });

    } else {
      return NextResponse.json(
        { 
          success: false,
          error: 'معاملات غير صحيحة. يجب تحديد action وإما "update-all" أو "update-single" مع rowIndex و newStatus'
        },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('❌ Error in empty status update API:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'خطأ في الخادم أثناء تحديث الحالات الفارغة'
      },
      { status: 500 }
    );
  }
} 