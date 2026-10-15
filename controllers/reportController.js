const Purchase = require('../models/Purchase');
const Sale = require('../models/Sale');
const Stock = require('../models/Stock');

const getReport = async (req, res) => {
  try {
    const {
      fromDate = '',
      toDate = '',
    } = req.query;

    const purchaseFilter = {};
    const saleFilter = {};

    // Date filter
    if (fromDate || toDate) {
      if (fromDate) {
        const startDate = new Date(
          `${fromDate}T00:00:00.000Z`
        );

        if (Number.isNaN(startDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid fromDate',
          });
        }

        purchaseFilter.billDate = {
          ...(purchaseFilter.billDate || {}),
          $gte: startDate,
        };

        saleFilter.billDate = {
          ...(saleFilter.billDate || {}),
          $gte: startDate,
        };
      }

      if (toDate) {
        const endDate = new Date(
          `${toDate}T23:59:59.999Z`
        );

        if (Number.isNaN(endDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid toDate',
          });
        }

        purchaseFilter.billDate = {
          ...(purchaseFilter.billDate || {}),
          $lte: endDate,
        };

        saleFilter.billDate = {
          ...(saleFilter.billDate || {}),
          $lte: endDate,
        };
      }
    }

    // Purchase summary
    const purchaseResult = await Purchase.aggregate([
      { $match: purchaseFilter },
      {
        $group: {
          _id: null,
          totalBills: { $sum: 1 },
          totalQuantity: { $sum: '$totalQuantity' },
          totalProducts: { $sum: '$totalProducts' },
        },
      },
    ]);

    // Sales summary
    const saleResult = await Sale.aggregate([
      { $match: saleFilter },
      {
        $group: {
          _id: null,
          totalBills: { $sum: 1 },
          totalQuantity: { $sum: '$totalQuantity' },
          totalProducts: { $sum: '$totalProducts' },
        },
      },
    ]);

    // Current stock
    const stockResult = await Stock.aggregate([
      {
        $group: {
          _id: null,
          totalStock: { $sum: '$currentStock' },
          totalProducts: { $sum: 1 },
        },
      },
    ]);

    const purchases = purchaseResult[0] || {
      totalBills: 0,
      totalQuantity: 0,
      totalProducts: 0,
    };

    const sales = saleResult[0] || {
      totalBills: 0,
      totalQuantity: 0,
      totalProducts: 0,
    };

    const stock = stockResult[0] || {
      totalStock: 0,
      totalProducts: 0,
    };

    res.status(200).json({
      success: true,

      filters: {
        fromDate,
        toDate,
      },

      purchases: {
        totalBills: purchases.totalBills,
        totalQuantity: purchases.totalQuantity,
        totalProducts: purchases.totalProducts,
      },

      sales: {
        totalBills: sales.totalBills,
        totalQuantity: sales.totalQuantity,
        totalProducts: sales.totalProducts,
      },

      stock: {
        totalStock: stock.totalStock,
        totalProducts: stock.totalProducts,
      },
    });
  } catch (error) {
    console.error(
      'Get Report Error:',
      error.message
    );

    res.status(500).json({
      success: false,
      message: 'Failed to generate report',
    });
  }
};

// ==========================================
// GET MONTHLY PDF REPORT DATA
// ==========================================

const getMonthlyReport = async (req, res) => {
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month);

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      year < 2000 ||
      month < 1 ||
      month > 12
    ) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid month and year",
      });
    }

    const today = new Date();

    const selectedMonthNumber = year * 12 + month;
    const currentMonthNumber =
      today.getFullYear() * 12 + (today.getMonth() + 1);

    if (selectedMonthNumber > currentMonthNumber) {
      return res.status(400).json({
        success: false,
        message: "Future months are not available",
      });
    }

    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const nextMonthDate = new Date(Date.UTC(year, month, 1));

    const dateFilter = {
      billDate: {
        $gte: startDate,
        $lt: nextMonthDate,
      },
    };

    const [purchases, sales] = await Promise.all([
      Purchase.find(dateFilter)
        .sort({ billDate: 1, billNumber: 1 })
        .lean(),

      Sale.find(dateFilter)
        .sort({ billDate: 1, billNumber: 1 })
        .lean(),
    ]);

    if (purchases.length === 0 && sales.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No purchase or sales data found for ${startDate.toLocaleString(
          "en-US",
          {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }
        )}`,
      });
    }

    const getTotals = (bills) => ({
      totalBills: bills.length,
      totalProducts: bills.reduce(
        (sum, bill) => sum + Number(bill.totalProducts || 0),
        0
      ),
      totalQuantity: bills.reduce(
        (sum, bill) => sum + Number(bill.totalQuantity || 0),
        0
      ),
    });

    return res.status(200).json({
      success: true,

      period: {
        year,
        month,
        monthName: startDate.toLocaleString("en-US", {
          month: "long",
          timeZone: "UTC",
        }),
      },

      summary: {
        purchases: getTotals(purchases),
        sales: getTotals(sales),
      },

      purchases,
      sales,
    });
  } catch (error) {
    console.error("Get Monthly Report Error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch monthly report data",
    });
  }
};

module.exports = {
  getReport,
  getMonthlyReport,
};