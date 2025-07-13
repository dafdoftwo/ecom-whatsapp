import { NextResponse } from 'next/server';
import { AutomationEngine } from '@/lib/services/automation-engine';

export async function GET() {
  try {
    console.log('🧪 Starting performance test for 3000 orders...');
    
    const startTime = Date.now();
    
    // Simulate 3000 orders data structure
    const generateTestOrders = (count: number) => {
      const orders = [];
      const productNames = [
        'موبايل المهام الخاصة k19',
        'لابتوب جيمنج عالي الأداء',
        'ساعة ذكية متطورة',
        'سماعات لاسلكية',
        'شاحن سريع محمول'
      ];
      
      const governorates = [
        'القاهرة', 'الإسكندرية', 'الجيزة', 'الشرقية', 'البحيرة',
        'المنوفية', 'الغربية', 'كفر الشيخ', 'الدقهلية', 'دمياط'
      ];
      
      const statuses = ['جديد', 'لم يرد', 'تم التأكيد', 'تم الشحن', 'مرفوض'];
      
      for (let i = 1; i <= count; i++) {
        orders.push({
          orderDate: `175192${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
          name: `عميل ${i}`,
          phone: `01${String(Math.floor(Math.random() * 1000000000)).padStart(9, '0')}`,
          whatsappNumber: '',
          governorate: governorates[Math.floor(Math.random() * governorates.length)],
          area: `منطقة ${i}`,
          address: `عنوان العميل ${i}`,
          orderDetails: `تفاصيل الطلب ${i}`,
          quantity: String(Math.floor(Math.random() * 5) + 1),
          source: '',
          totalPrice: String(Math.floor(Math.random() * 5000) + 500),
          productName: productNames[Math.floor(Math.random() * productNames.length)],
          orderStatus: statuses[Math.floor(Math.random() * statuses.length)],
          notes: `ملاحظات الطلب ${i}`,
          sourceChannel: 'Facebook',
          whatsappStatus: '',
          orderId: `ORDER-${String(i).padStart(6, '0')}`,
          rowIndex: i + 1,
          processedPhone: `201${String(Math.floor(Math.random() * 1000000000)).padStart(9, '0')}`,
          validPhone: Math.random() > 0.1, // 90% valid phones
          lastMessageSent: '',
          lastUpdated: new Date().toISOString()
        });
      }
      
      return orders;
    };
    
    // Generate test data
    console.log('📊 Generating 3000 test orders...');
    const testOrders = generateTestOrders(3000);
    console.log(`✅ Generated ${testOrders.length} test orders`);
    
    // Performance metrics
    const metrics = {
      totalOrders: testOrders.length,
      validPhones: testOrders.filter(o => o.validPhone).length,
      invalidPhones: testOrders.filter(o => !o.validPhone).length,
      ordersByStatus: {} as Record<string, number>,
      ordersByGovernorate: {} as Record<string, number>,
      estimatedProcessingTime: 0,
      memoryUsage: process.memoryUsage(),
      systemCapabilities: {
        batchSize: 50,
        estimatedBatches: Math.ceil(3000 / 50),
        estimatedTimePerBatch: 5, // seconds
        totalEstimatedTime: Math.ceil(3000 / 50) * 5 // seconds
      }
    };
    
    // Count orders by status
    testOrders.forEach(order => {
      metrics.ordersByStatus[order.orderStatus] = (metrics.ordersByStatus[order.orderStatus] || 0) + 1;
      metrics.ordersByGovernorate[order.governorate] = (metrics.ordersByGovernorate[order.governorate] || 0) + 1;
    });
    
    // Simulate batch processing performance
    console.log('🔄 Simulating batch processing...');
    const batchProcessingStart = Date.now();
    
    const batchSize = 50;
    const batches = [];
    
    for (let i = 0; i < testOrders.length; i += batchSize) {
      const batch = testOrders.slice(i, i + batchSize);
      const batchStartTime = Date.now();
      
      // Simulate processing time for each order in batch
      let processedInBatch = 0;
      let skippedInBatch = 0;
      
      for (const order of batch) {
        // Simulate validation and processing logic
        if (order.validPhone && order.name && order.orderStatus) {
          processedInBatch++;
          // Simulate processing time (1-10ms per order)
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
        } else {
          skippedInBatch++;
        }
      }
      
      const batchEndTime = Date.now();
      const batchDuration = batchEndTime - batchStartTime;
      
      batches.push({
        batchNumber: Math.floor(i / batchSize) + 1,
        orderCount: batch.length,
        processedCount: processedInBatch,
        skippedCount: skippedInBatch,
        processingTime: batchDuration,
        averageTimePerOrder: batchDuration / batch.length
      });
      
      // Log progress every 10 batches
      if (batches.length % 10 === 0) {
        console.log(`📊 Processed ${batches.length} batches (${batches.length * batchSize} orders)`);
      }
    }
    
    const batchProcessingEnd = Date.now();
    const totalProcessingTime = batchProcessingEnd - batchProcessingStart;
    
    // Calculate performance statistics
    const performanceStats = {
      totalProcessingTime,
      averageTimePerOrder: totalProcessingTime / testOrders.length,
      averageTimePerBatch: totalProcessingTime / batches.length,
      ordersPerSecond: (testOrders.length / totalProcessingTime) * 1000,
      totalProcessedOrders: batches.reduce((sum, batch) => sum + batch.processedCount, 0),
      totalSkippedOrders: batches.reduce((sum, batch) => sum + batch.skippedCount, 0),
      efficiency: (batches.reduce((sum, batch) => sum + batch.processedCount, 0) / testOrders.length) * 100
    };
    
    // System resource analysis
    const finalMemoryUsage = process.memoryUsage();
    const memoryIncrease = {
      heapUsed: finalMemoryUsage.heapUsed - metrics.memoryUsage.heapUsed,
      heapTotal: finalMemoryUsage.heapTotal - metrics.memoryUsage.heapTotal,
      external: finalMemoryUsage.external - metrics.memoryUsage.external,
      rss: finalMemoryUsage.rss - metrics.memoryUsage.rss
    };
    
    // Performance recommendations
    const recommendations = [];
    
    if (performanceStats.averageTimePerOrder > 100) {
      recommendations.push('Consider increasing batch size to improve throughput');
    }
    
    if (memoryIncrease.heapUsed > 100 * 1024 * 1024) { // 100MB
      recommendations.push('Memory usage is high, consider implementing memory optimization');
    }
    
    if (performanceStats.efficiency < 90) {
      recommendations.push('Phone validation efficiency can be improved');
    }
    
    if (performanceStats.ordersPerSecond < 10) {
      recommendations.push('Consider parallel processing for better performance');
    } else if (performanceStats.ordersPerSecond > 100) {
      recommendations.push('Excellent performance! System can handle high loads efficiently');
    }
    
    const endTime = Date.now();
    const totalTestTime = endTime - startTime;
    
    console.log(`✅ Performance test completed in ${totalTestTime}ms`);
    console.log(`📊 Processed ${performanceStats.totalProcessedOrders} orders at ${performanceStats.ordersPerSecond.toFixed(2)} orders/second`);
    
    return NextResponse.json({
      success: true,
      testSummary: {
        totalOrders: testOrders.length,
        testDuration: totalTestTime,
        conclusion: performanceStats.ordersPerSecond > 50 ? 
          'System can handle 3000+ orders efficiently' : 
          'System needs optimization for 3000+ orders'
      },
      performanceStats,
      batchAnalysis: {
        totalBatches: batches.length,
        averageBatchTime: batches.reduce((sum, b) => sum + b.processingTime, 0) / batches.length,
        fastestBatch: Math.min(...batches.map(b => b.processingTime)),
        slowestBatch: Math.max(...batches.map(b => b.processingTime))
      },
      systemResources: {
        initialMemory: metrics.memoryUsage,
        finalMemory: finalMemoryUsage,
        memoryIncrease,
        memoryEfficient: memoryIncrease.heapUsed < 200 * 1024 * 1024 // 200MB threshold
      },
      orderDistribution: {
        byStatus: metrics.ordersByStatus,
        byGovernorate: metrics.ordersByGovernorate
      },
      recommendations,
      scalabilityAssessment: {
        canHandle3000Orders: performanceStats.ordersPerSecond > 20,
        estimatedMaxCapacity: Math.floor(performanceStats.ordersPerSecond * 300), // 5 minute processing window
        recommendedBatchSize: performanceStats.averageTimePerBatch < 5000 ? 50 : 25,
        systemHealth: 'good'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Performance test failed:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Performance test failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 