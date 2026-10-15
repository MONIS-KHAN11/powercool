const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Stock = require('../models/Stock');
const StockTransaction = require('../models/StockTransaction');
const ProductSize = require('../models/ProductSize');

// ==========================================
// CREATE SALE
// ==========================================


const createSale = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const {
      billNumber,
      billDate,
      customerName = '',
      items,
    } = req.body;

    if (
      !billNumber?.trim() ||
      !billDate ||
      Number.isNaN(new Date(billDate).getTime()) ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Valid bill number, date and at least one item are required',
      });
    }

    const existingBill = await Sale.findOne({
      billNumber: billNumber.trim(),
    }).session(session);

    if (existingBill) {
      await session.abortTransaction();
      return res.status(409).json({
        success: false,
        message: 'Sale bill number already exists',
      });
    }

    const saleItems = [];

    for (const item of items) {
      const quantity = Number(item.quantity);

      if (
        !item.productId ||
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Each item must have a valid product and quantity',
        });
      }

      const product = await Product.findById(item.productId).session(session);

      if (!product) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.productId}`,
        });
      }

      // Resolve the selected size for this product.
      let productSize;

      if (
        item.productSizeId &&
        mongoose.Types.ObjectId.isValid(item.productSizeId)
      ) {
        productSize = await ProductSize.findOne({
          _id: item.productSizeId,
          productId: product._id,
        }).session(session);
      } else if (
        typeof item.size === 'string' &&
        item.size.trim() &&
        typeof item.unit === 'string' &&
        item.unit.trim()
      ) {
        productSize = await ProductSize.findOne({
          productId: product._id,
          size: item.size.trim(),
          unit: item.unit.trim().toUpperCase(),
        }).session(session);
      }

      if (!productSize) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Valid size and unit are required for ${product.name}`,
        });
      }

      let stock = await Stock.findOne({
        productSizeId: productSize._id,
      }).session(session);
      const stockBefore = Number.isFinite(Number(stock?.currentStock))
        ? Number(stock.currentStock)
        : 0;

      // Negative stock is allowed.
      const stockAfter = stockBefore - quantity;

      if (stock) {
        stock.currentStock = stockAfter;
        await stock.save({ session });
      } else {
        stock = new Stock({
          productId: product._id,
          productSizeId: productSize._id,
          productName: product.name,
          size: productSize.size,
          unit: productSize.unit,
          currentStock: stockAfter,
        });

        await stock.save({ session });
      }

      saleItems.push({
        productId: product._id,
        productSizeId: productSize._id,
        productName: product.name,
        size: productSize.size,
        unit: productSize.unit,
        quantity,
      });

      await StockTransaction.create(
        [
          {
            productId: product._id,
            productSizeId: productSize._id,
            productName: product.name,
            size: productSize.size,
            unit: productSize.unit,
            type: 'SALE',
            billNumber: billNumber.trim(),
            billDate: new Date(billDate),
            quantity: -quantity,
            stockBefore,
            stockAfter,
          },
        ],
        { session }
      );
    }

    const totalProducts = saleItems.length;
    const totalQuantity = saleItems.reduce(
      (total, item) => total + item.quantity,
      0
    );

    const sale = await Sale.create(
      [
        {
          billNumber: billNumber.trim(),
          billDate,
          customerName:
            typeof customerName === 'string' ? customerName.trim() : '',
          items: saleItems,
          totalProducts,
          totalQuantity,
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return res.status(201).json({
      success: true,
      message: 'Sale bill created successfully',
      sale: sale[0],
    });
  } catch (error) {
    await session.abortTransaction();

    console.error('Create Sale Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to create sale bill',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

// ==========================================
// GET SALES HISTORY
// ==========================================

const getSales = async (req, res) => {
  try {
    const {
      search = '',
      fromDate = '',
      toDate = '',
      page = 1,
      limit = 20,
    } = req.query;

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(
      Math.max(Number(limit) || 20, 1),
      100
    );

    const skip = (pageNumber - 1) * limitNumber;

    const filter = {};

    // Search by bill number / customer
    if (search.trim()) {
      filter.$or = [
        {
          billNumber: {
            $regex: search.trim(),
            $options: 'i',
          },
        },
        {
          customerName: {
            $regex: search.trim(),
            $options: 'i',
          },
        },
      ];
    }

    // Date filter
    if (fromDate || toDate) {
      filter.billDate = {};

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

        filter.billDate.$gte = startDate;
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

        filter.billDate.$lte = endDate;
      }
    }

    const [sales, total] = await Promise.all([
      Sale.find(filter)
        .sort({
          billDate: -1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(limitNumber)
        .lean(),

      Sale.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: sales,
      sales,

      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    console.error(
      'Get Sales Error:',
      error.message
    );

    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales',
    });
  }
};

// ==========================================
// DELETE SALE BILL
// ==========================================

const deleteSale = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { id } = req.params;


    if (!mongoose.isValidObjectId(id)) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Invalid sale bill ID",
      });
    }


    const sale =
      await Sale.findById(id).session(
        session
      );

    if (!sale) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: 'Sale bill not found',
      });
    }

    // ==========================================
    // REVERSE SALE STOCK
    // ==========================================


    for (const item of sale.items) {
      const quantity = Number(item.quantity);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(
          `Invalid quantity for ${item.productName}`
        );
      }

      if (!item.productSizeId) {
        throw new Error(
          `Product size missing for ${item.productName}. Cannot safely restore stock.`
        );
      }

      const stock = await Stock.findOne({
        productSizeId: item.productSizeId,
      }).session(session);

      if (!stock) {
        throw new Error(
          `Stock record not found for ${item.productName}, size ${item.size}`
        );
      }

      const stockBefore = Number(stock.currentStock) || 0;
      const stockAfter = stockBefore + quantity;

      // Restore the sold quantity to this exact product size.
      stock.currentStock = stockAfter;
      await stock.save({ session });

      await StockTransaction.create(
        [
          {
            productId: item.productId,
            productSizeId: item.productSizeId,
            productName: item.productName,
            size: item.size,
            unit: item.unit,
            type: 'ADJUSTMENT',
            billNumber: sale.billNumber,
            billDate: sale.billDate,
            quantity,
            stockBefore,
            stockAfter,
          },
        ],
        { session }
      );
    }

    // ==========================================
    // DELETE SALE
    // ==========================================

    await Sale.findByIdAndDelete(id)
      .session(session);

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message:
        'Sale bill deleted successfully',
      billNumber:
        sale.billNumber,
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    console.error(
      'Delete Sale Error:',
      error.message
    );

    res.status(500).json({
      success: false,
      message:
        'Failed to delete sale bill',
    });
  } finally {
    session.endSession();
  }
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  createSale,
  getSales,
  deleteSale,
};