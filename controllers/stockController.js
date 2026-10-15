const Product = require('../models/Product');
const Stock = require('../models/Stock');
const StockTransaction = require('../models/StockTransaction');
const ProductSize = require('../models/ProductSize');
const Purchase = require('../models/Purchase');
const Sale = require('../models/Sale');

// ===============================
// GET STOCK
// ===============================
const getStock = async (req, res) => {
  try {
    const {
      search = '',
      page = 1,
      limit = 100,
    } = req.query;

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(
      Math.max(Number(limit) || 100, 1),
      100
    );
    const skip = (pageNumber - 1) * limitNumber;

    const filter = {};

    if (search.trim()) {
      filter.productName = {
        $regex: search.trim(),
        $options: 'i',
      };
    }

    const [stocks, total] = await Promise.all([
      Stock.find(filter)
        .sort({ productName: 1, size: 1, unit: 1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),

      Stock.countDocuments(filter),
    ]);

    const stockIds = stocks.map(
      (stock) => stock.productSizeId
    );

    const transactions = await StockTransaction.aggregate([
      {
        $match: {
          productSizeId: { $in: stockIds },
          type: { $in: ['PURCHASE', 'SALE'] },
        },
      },
      {
        $group: {
          _id: {
            productSizeId: '$productSizeId',
            type: '$type',
          },
          totalQuantity: {
            $sum: { $abs: '$quantity' },
          },
        },
      },
    ]);

    const purchaseMap = new Map();
    const salesMap = new Map();
    // Calculate purchase and sale totals from existing bills.
    // Deleted bills are not included because they no longer exist.

    const [purchaseTotals, saleTotals] = await Promise.all([
      Purchase.aggregate([
        { $unwind: '$items' },
        {
          $match: {
            'items.productSizeId': { $in: stockIds },
          },
        },
        {
          $group: {
            _id: '$items.productSizeId',
            totalQuantity: {
              $sum: {
                $convert: {
                  input: '$items.quantity',
                  to: 'double',
                  onError: 0,
                  onNull: 0,
                },
              },
            },
          },
        },
      ]),

      Sale.aggregate([
        { $unwind: '$items' },
        {
          $match: {
            'items.productSizeId': { $in: stockIds },
          },
        },
        {
          $group: {
            _id: '$items.productSizeId',
            totalQuantity: {
              $sum: {
                $convert: {
                  input: '$items.quantity',
                  to: 'double',
                  onError: 0,
                  onNull: 0,
                },
              },
            },
          },
        },
      ]),
    ]);

    purchaseTotals.forEach((item) => {
      if (!item._id) return;

      purchaseMap.set(
        item._id.toString(),
        item.totalQuantity
      );
    });

    saleTotals.forEach((item) => {
      if (!item._id) return;

      salesMap.set(
        item._id.toString(),
        item.totalQuantity
      );
    });


    const data = stocks.map((stock) => {
      const sizeId = stock.productSizeId?.toString();

      const purchase = Number(purchaseMap.get(sizeId) ?? 0);
      const sales = Number(salesMap.get(sizeId) ?? 0);

      // Calculate stock from existing purchase and sale bills
      const currentStock = purchase - sales;

      return {
        productId: stock.productId,
        productSizeId: stock.productSizeId,
        productName: stock.productName,
        size: stock.size,
        unit: stock.unit,
        purchase,
        sales,
        currentStock,
        status:
          currentStock < 0
            ? 'Negative Stock'
            : currentStock === 0
              ? 'Out of Stock'
              : currentStock <= 10
                ? 'Low Stock'
                : 'In Stock',
      };
    });


    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    console.error('Get Stock Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch stock',
    });
  }
};

// ===============================
// GET STOCK HISTORY
// ===============================
const getStockHistory = async (req, res) => {
  try {
    const {
      productId = '',
      type = '',
      fromDate = '',
      toDate = '',
      page,
      limit,
    } = req.query;

    // Pagination is applied only when page or limit is provided.
    const usePagination =
      page !== undefined || limit !== undefined;

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(
      Number(limit) || 100,
      1
    );
    const skip = (pageNumber - 1) * limitNumber;

    const filter = {};

    // Product filter
    if (productId.trim()) {
      filter.productId = productId.trim();
    }

    // Type filter: PURCHASE, SALE, or all
    if (type.trim()) {
      const normalizedType = type.trim().toUpperCase();
      const allowedTypes = ['PURCHASE', 'SALE'];

      if (!allowedTypes.includes(normalizedType)) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid type. Use PURCHASE, SALE, or leave empty for All.',
        });
      }

      filter.type = normalizedType;
    }

    // Filter by India calendar dates (IST, UTC+5:30)
    if (fromDate || toDate) {
      filter.billDate = {};

      const parseDate = (dateString, isEndDate = false) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
          return null;
        }

        const [year, month, day] =
          dateString.split('-').map(Number);

        const date = new Date(
          Date.UTC(year, month - 1, day)
        );

        // Reject invalid dates such as 2026-02-31
        if (
          date.getUTCFullYear() !== year ||
          date.getUTCMonth() !== month - 1 ||
          date.getUTCDate() !== day
        ) {
          return null;
        }

        // Convert IST day boundaries to UTC.
        const utc = Date.UTC(
          year,
          month - 1,
          day,
          isEndDate ? 23 : 0,
          isEndDate ? 59 : 0,
          isEndDate ? 59 : 0,
          isEndDate ? 999 : 0
        );

        return new Date(
          utc - (5 * 60 + 30) * 60 * 1000
        );
      };

      if (fromDate) {
        const startDate = parseDate(fromDate);

        if (!startDate) {
          return res.status(400).json({
            success: false,
            message: 'Invalid fromDate. Use YYYY-MM-DD.',
          });
        }

        filter.billDate.$gte = startDate;
      }

      if (toDate) {
        const endDate = parseDate(toDate, true);

        if (!endDate) {
          return res.status(400).json({
            success: false,
            message: 'Invalid toDate. Use YYYY-MM-DD.',
          });
        }

        filter.billDate.$lte = endDate;
      }
    }

    let historyQuery = StockTransaction.find(filter)
      .sort({ billDate: -1, createdAt: -1 });

    // No page/limit query parameters means return all matches.
    if (usePagination) {
      historyQuery = historyQuery
        .skip(skip)
        .limit(limitNumber);
    }

    const [history, total] = await Promise.all([
      historyQuery.lean(),
      StockTransaction.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: history,
      pagination: {
        page: pageNumber,
        limit: usePagination ? limitNumber : total,
        total,
        totalPages: usePagination
          ? Math.ceil(total / limitNumber)
          : total > 0 ? 1 : 0,
      },
    });
  } catch (error) {
    console.error(
      'Get Stock History Error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch stock history',
    });
  }
};

module.exports = {
  getStock,
  getStockHistory,
};