// backend/routes/manager.routes.js
// Executive & Manager Workspace API endpoints.
// Delivers rich business intelligence, department KPI metrics, sales breakdowns,
// and export capabilities for executive oversight.
const express = require('express');
const { pool } = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole('manager', 'admin'));

// GET /api/manager/dashboard
router.get('/dashboard', async (req, res, next) => {
  try {
    const range = typeof req.query.range === 'string' ? req.query.range : '30days';

    let dateFilterSql = 'AND o.order_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    let paymentDateFilter = 'AND verified_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';

    if (range === 'today') {
      dateFilterSql = 'AND o.order_date >= CURDATE() AND o.order_date < CURDATE() + INTERVAL 1 DAY';
      paymentDateFilter = 'AND verified_at >= CURDATE() AND verified_at < CURDATE() + INTERVAL 1 DAY';
    } else if (range === '7days') {
      dateFilterSql = 'AND o.order_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
      paymentDateFilter = 'AND verified_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
    } else if (range === 'all') {
      dateFilterSql = '';
      paymentDateFilter = '';
    }

    const [
      revenueTodayResult,
      revenueTotalResult,
      ordersResult,
      stockResult,
      topProductsResult,
      statusResult,
      categoryResult,
      recentOrdersResult,
    ] = await Promise.all([
      // Today revenue
      pool.query(`
        SELECT COALESCE(SUM(amount), 0) AS revenue, COUNT(*) AS paidOrders
        FROM Payments
        WHERE payment_status = 'PAID'
          AND verified_at >= CURDATE()
          AND verified_at < CURDATE() + INTERVAL 1 DAY
      `).catch(() => [[{ revenue: 0, paidOrders: 0 }]]),

      // Total revenue in selected range
      pool.query(`
        SELECT COALESCE(SUM(amount), 0) AS revenue, COUNT(*) AS paidOrders
        FROM Payments
        WHERE payment_status = 'PAID' ${paymentDateFilter}
      `).catch(() => [[{ revenue: 0, paidOrders: 0 }]]),

      // Orders metrics
      pool.query(`
        SELECT
          COUNT(*) AS totalOrders,
          SUM(CASE WHEN order_date >= CURDATE() AND order_date < CURDATE() + INTERVAL 1 DAY THEN 1 ELSE 0 END) AS newOrdersToday,
          SUM(CASE WHEN payment_status = 'PAID' THEN 1 ELSE 0 END) AS paidOrders,
          SUM(CASE WHEN payment_status = 'PENDING_PAYMENT' OR payment_status IS NULL THEN 1 ELSE 0 END) AS pendingPayment,
          SUM(CASE WHEN status IN ('รอดำเนินการ', 'กำลังจัดเตรียมสินค้า') THEN 1 ELSE 0 END) AS awaitingFulfilment,
          SUM(CASE WHEN status = 'จัดส่งแล้ว' THEN 1 ELSE 0 END) AS inTransit,
          SUM(CASE WHEN status = 'สำเร็จ' THEN 1 ELSE 0 END) AS completedOrders,
          SUM(CASE WHEN status = 'ยกเลิก' THEN 1 ELSE 0 END) AS cancelledOrders,
          COALESCE(AVG(total_amount), 0) AS avgOrderValue
        FROM Orders o
        WHERE 1=1 ${dateFilterSql}
      `).catch(() => [[{}]]),

      // Inventory metrics
      pool.query(`
        SELECT
          COUNT(*) AS totalProducts,
          COALESCE(SUM(stock), 0) AS totalItems,
          COALESCE(SUM(stock * price), 0) AS totalRetailValue,
          COALESCE(SUM(stock * ROUND(price * 0.7)), 0) AS totalCostValue,
          SUM(CASE WHEN stock > 0 AND stock <= 10 THEN 1 ELSE 0 END) AS lowStock,
          SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) AS outOfStock
        FROM Inventory
        WHERE is_active = 1 OR is_active IS NULL
      `).catch(() => [[{}]]),

      // Top Selling Products
      pool.query(`
        SELECT
          i.id,
          i.name,
          i.category,
          i.stock AS stockRemaining,
          SUM(od.quantity) AS quantity,
          SUM(od.subtotal) AS revenue
        FROM Order_Details od
        JOIN Orders o ON o.order_id = od.order_id
        JOIN Inventory i ON i.id = od.product_id
        WHERE o.status <> 'ยกเลิก' ${dateFilterSql}
        GROUP BY i.id, i.name, i.category, i.stock
        ORDER BY quantity DESC, revenue DESC
        LIMIT 10
      `).catch(() => [[]]),

      // Order Status breakdown
      pool.query(`
        SELECT status, COUNT(*) AS count
        FROM Orders o
        WHERE 1=1 ${dateFilterSql}
        GROUP BY status
        ORDER BY FIELD(status, 'รอดำเนินการ', 'กำลังจัดเตรียมสินค้า', 'จัดส่งแล้ว', 'สำเร็จ', 'ยกเลิก'), status
      `).catch(() => [[]]),

      // Sales by Category
      pool.query(`
        SELECT
          COALESCE(i.category, 'ทั่วไป') AS category,
          SUM(od.quantity) AS itemsSold,
          SUM(od.subtotal) AS revenue
        FROM Order_Details od
        JOIN Orders o ON o.order_id = od.order_id
        JOIN Inventory i ON i.id = od.product_id
        WHERE o.status <> 'ยกเลิก' ${dateFilterSql}
        GROUP BY i.category
        ORDER BY revenue DESC
      `).catch(() => [[]]),

      // Recent 10 Orders
      pool.query(`
        SELECT
          o.order_id,
          o.order_date,
          COALESCE(u.username, 'ลูกค้าทั่วไป') AS customer,
          o.total_amount,
          o.status,
          COALESCE(o.payment_status, 'PENDING_PAYMENT') AS payment_status,
          (SELECT COUNT(*) FROM Order_Details WHERE order_id = o.order_id) AS itemsCount
        FROM Orders o
        LEFT JOIN Users u ON u.id = o.user_id
        ORDER BY o.order_date DESC, o.order_id DESC
        LIMIT 15
      `).catch(() => [[]]),
    ]);

    const todayRev = revenueTodayResult[0][0] || {};
    const totalRev = revenueTotalResult[0][0] || {};
    const orders = ordersResult[0][0] || {};
    const stock = stockResult[0][0] || {};

    const totalOrdersCount = Number(orders.totalOrders) || 0;
    const completedCount = Number(orders.completedOrders) || 0;
    const fulfillmentRate = totalOrdersCount > 0 ? Math.round((completedCount / totalOrdersCount) * 100) : 100;

    const categories = categoryResult[0].map((c) => ({
      category: c.category || 'ทั่วไป',
      itemsSold: Number(c.itemsSold) || 0,
      revenue: Number(c.revenue) || 0,
    }));

    const totalCategoryRevenue = categories.reduce((sum, c) => sum + c.revenue, 0);
    const categoriesWithShare = categories.map((c) => ({
      ...c,
      percentage: totalCategoryRevenue > 0 ? Math.round((c.revenue / totalCategoryRevenue) * 100) : 0,
    }));

    res.json({
      range,
      today: {
        revenue: Number(todayRev.revenue) || 0,
        paidOrders: Number(todayRev.paidOrders) || 0,
        newOrders: Number(orders.newOrdersToday) || 0,
      },
      summary: {
        totalRevenue: Number(totalRev.revenue) || (Number(orders.paidOrders || 0) * Number(orders.avgOrderValue || 0)),
        totalOrders: totalOrdersCount,
        paidOrdersCount: Number(orders.paidOrders) || 0,
        pendingPaymentCount: Number(orders.pendingPayment) || 0,
        avgOrderValue: Math.round(Number(orders.avgOrderValue) || 0),
        fulfillmentRate,
      },
      departments: {
        delivery: {
          pending: Number(orders.awaitingFulfilment) || 0,
          inTransit: Number(orders.inTransit) || 0,
          completed: completedCount,
          cancelled: Number(orders.cancelledOrders) || 0,
        },
        warehouse: {
          totalProducts: Number(stock.totalProducts) || 0,
          totalItems: Number(stock.totalItems) || 0,
          totalRetailValue: Number(stock.totalRetailValue) || 0,
          totalCostValue: Number(stock.totalCostValue) || 0,
          lowStock: Number(stock.lowStock) || 0,
          outOfStock: Number(stock.outOfStock) || 0,
        },
        finance: {
          totalIncome: Number(totalRev.revenue) || 0,
          paidOrders: Number(orders.paidOrders) || 0,
          pendingPayments: Number(orders.pendingPayment) || 0,
        },
      },
      operations: {
        awaitingFulfilment: Number(orders.awaitingFulfilment) || 0,
        lowStock: Number(stock.lowStock) || 0,
        outOfStock: Number(stock.outOfStock) || 0,
      },
      topProducts: topProductsResult[0].map((product) => ({
        id: Number(product.id),
        name: product.name,
        category: product.category,
        quantity: Number(product.quantity) || 0,
        revenue: Number(product.revenue) || 0,
        stockRemaining: Number(product.stockRemaining) || 0,
      })),
      statusSummary: statusResult[0].map((item) => ({
        status: item.status,
        count: Number(item.count) || 0,
      })),
      categories: categoriesWithShare,
      recentOrders: recentOrdersResult[0].map((o) => ({
        order_id: Number(o.order_id),
        order_date: o.order_date,
        customer: o.customer,
        total_amount: Number(o.total_amount) || 0,
        status: o.status,
        payment_status: o.payment_status,
        itemsCount: Number(o.itemsCount) || 1,
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
