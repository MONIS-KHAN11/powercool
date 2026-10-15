const mongoose = require('mongoose');
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const Stock = require('../models/Stock');
const StockTransaction = require('../models/StockTransaction');
const ProductSize = require('../models/ProductSize');

// ==========================================
// CREATE PURCHASE
// ==========================================


const createPurchase = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const {
      billNumber,
      billDate,
      supplierName = '',
      items,
    } = req.body;

    if (
      !billNumber?.trim() ||
      !billDate ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Bill number, bill date and at least one item are required',
      });
    }

    const purchaseItems = [];

    for (const item of items) {
      const quantity = Number(item.quantity);

      if (
        !item.productId ||
        !item.size ||
        !item.unit ||
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Each item needs a product, size, unit and valid quantity',
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

      const productSize = await ProductSize.findOne({
        productId: product._id,
        size: item.size.trim(),
        unit: item.unit,
      }).session(session);

      if (!productSize) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: `Size "${item.size}" with unit "${item.unit}" not found for ${product.name}`,
        });
      }

      let stock = await Stock.findOne({
        productSizeId: productSize._id,
      }).session(session);

      const stockBefore = stock ? stock.currentStock : 0;
      const stockAfter = stockBefore + quantity;

      if (stock) {
        stock.currentStock = stockAfter;
        stock.productId = product._id;
        stock.productName = product.name;
        stock.size = productSize.size;
        stock.unit = productSize.unit;
        await stock.save({ session });
      } else {
        [stock] = await Stock.create(
          [
            {
              productId: product._id,
              productSizeId: productSize._id,
              productName: product.name,
              size: productSize.size,
              unit: productSize.unit,
              currentStock: stockAfter,
            },
          ],
          { session }
        );
      }

      purchaseItems.push({
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
            type: 'PURCHASE',
            billNumber: billNumber.trim(),
            billDate: new Date(billDate),
            quantity,
            stockBefore,
            stockAfter,
          }
        ],
        { session }
      );
    }

    const totalProducts = purchaseItems.length;
    const totalQuantity = purchaseItems.reduce(
      (total, item) => total + item.quantity,
      0
    );

    const [purchase] = await Purchase.create(
      [
        {
          billNumber: billNumber.trim(),
          billDate,
          supplierName: supplierName.trim(),
          items: purchaseItems,
          totalProducts,
          totalQuantity,
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return res.status(201).json({
      success: true,
      message: 'Purchase bill created successfully',
      purchase,
    });
  } catch (error) {
    await session.abortTransaction();

    console.error('Create Purchase Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to create purchase bill',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

const getPurchases = async (req, res) => {
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

    // Search by bill number / supplier
    if (search.trim()) {
      filter.$or = [
        {
          billNumber: {
            $regex: search.trim(),
            $options: 'i',
          },
        },
        {
          supplierName: {
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

    const [purchases, total] = await Promise.all([
      Purchase.find(filter)
        .sort({
          billDate: -1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(limitNumber)
        .lean(),

      Purchase.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: purchases,
      purchases,

      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    console.error(
      'Get Purchases Error:',
      error.message
    );

    res.status(500).json({
      success: false,
      message: 'Failed to fetch purchases',
    });
  }
};
// ==========================================
// UPDATE PURCHASE BILL
// ==========================================


const updatePurchase = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { id } = req.params;
    const { billNumber, billDate, supplierName = "", items } = req.body;

    if (
      !mongoose.isValidObjectId(id) ||
      !billDate ||
      Number.isNaN(new Date(billDate).getTime()) ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Valid bill ID, bill date and at least one item are required",
      });
    }

    const existingPurchase = await Purchase.findById(id).session(session);

    if (!existingPurchase) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Purchase bill not found",
      });
    }

    const nextBillNumber = String(
      billNumber ?? existingPurchase.billNumber
    ).trim();

    if (!nextBillNumber) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Bill number is required",
      });
    }

    // Validate and resolve every new item before changing stock.
    const newItems = [];

    for (const item of items) {
      const quantity = Number(item.quantity);

      if (
        !item.productId ||
        !item.size ||
        !item.unit ||
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        throw new Error(
          "Each item needs a product, size, unit and quantity greater than zero"
        );
      }

      const product = await Product.findById(item.productId).session(session);

      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      const productSize = await ProductSize.findOne({
        productId: product._id,
        size: String(item.size).trim(),
        unit: item.unit,
      }).session(session);

      if (!productSize) {
        throw new Error(
          `Size "${item.size}" (${item.unit}) not found for ${product.name}`
        );
      }

      newItems.push({
        productId: product._id,
        productSizeId: productSize._id,
        productName: product.name,
        size: productSize.size,
        unit: productSize.unit,
        quantity,
      });
    }

    // Reverse the old purchase quantities from size-wise stock.
    for (const oldItem of existingPurchase.items) {
      const oldSizeId = oldItem.productSizeId;

      if (!oldSizeId) {
        throw new Error(
          `Old item "${oldItem.productName}" has no productSizeId. Fix this bill's legacy data before editing.`
        );
      }

      const stock = await Stock.findOne({
        productSizeId: oldSizeId,
      }).session(session);

      if (!stock) {
        throw new Error(
          `Stock record not found for ${oldItem.productName}, size ${oldItem.size}`
        );
      }

      const quantity = Number(oldItem.quantity);
      const stockBefore = stock.currentStock;
      const stockAfter = stockBefore - quantity;

      // Negative stock is allowed after purchase bill deletion.
      stock.currentStock = stockAfter;

      stock.currentStock = Math.max(0, stockAfter);
      await stock.save({ session });

      await StockTransaction.create(
        [
          {
            productId: oldItem.productId,
            productSizeId: oldSizeId,
            productName: oldItem.productName,
            size: oldItem.size,
            unit: oldItem.unit,
            type: "ADJUSTMENT",
            billNumber: existingPurchase.billNumber,
            billDate: existingPurchase.billDate,
            quantity: -quantity,
            stockBefore,
            stockAfter: stock.currentStock,
          },
        ],
        { session }
      );
    }

    // Apply the edited purchase quantities.
    for (const item of newItems) {
      let stock = await Stock.findOne({
        productSizeId: item.productSizeId,
      }).session(session);

      const stockBefore = stock ? stock.currentStock : 0;
      const stockAfter = stockBefore + item.quantity;

      if (stock) {
        stock.currentStock = stockAfter;
        stock.productId = item.productId;
        stock.productName = item.productName;
        stock.size = item.size;
        stock.unit = item.unit;
        await stock.save({ session });
      } else {
        [stock] = await Stock.create(
          [
            {
              productId: item.productId,
              productSizeId: item.productSizeId,
              productName: item.productName,
              size: item.size,
              unit: item.unit,
              currentStock: stockAfter,
            },
          ],
          { session }
        );
      }

      await StockTransaction.create(
        [
          {
            productId: item.productId,
            productSizeId: item.productSizeId,
            productName: item.productName,
            size: item.size,
            unit: item.unit,
            type: "ADJUSTMENT",
            billNumber: nextBillNumber,
            billDate: new Date(billDate),
            quantity: item.quantity,
            stockBefore,
            stockAfter,
          },
        ],
        { session }
      );
    }

    existingPurchase.billNumber = nextBillNumber;
    existingPurchase.billDate = new Date(billDate);
    existingPurchase.supplierName = String(supplierName ?? "").trim();
    existingPurchase.items = newItems;
    existingPurchase.totalProducts = newItems.length;
    existingPurchase.totalQuantity = newItems.reduce(
      (total, item) => total + item.quantity,
      0
    );

    await existingPurchase.save({ session });
    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "Purchase bill updated successfully",
      purchase: existingPurchase,
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    console.error("Update Purchase Error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to update purchase bill",
    });
  } finally {
    await session.endSession();
  }
};


const deletePurchase = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid purchase bill ID",
      });
    }

    const purchase = await Purchase.findById(id).session(session);

    if (!purchase) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Purchase bill not found",
      });
    }

    for (const item of purchase.items) {
      if (!item.productSizeId) {
        throw new Error(
          `Missing productSizeId for ${item.productName}. Cannot safely delete this bill.`
        );
      }

      const stock = await Stock.findOne({
        productSizeId: item.productSizeId,
      }).session(session);

      if (!stock) {
        throw new Error(
          `Stock record not found for ${item.productName} (${item.size})`
        );
      }

      const stockBefore = stock.currentStock;
      const stockAfter = stockBefore - Number(item.quantity);
      // Allow negative stock when deleting a purchase bill.
      stock.currentStock = stockAfter;
      await stock.save({ session });

      stock.currentStock = Math.max(0, stockAfter);
      await stock.save({ session });

      await StockTransaction.create(
        [
          {
            productId: item.productId,
            productSizeId: item.productSizeId,
            productName: item.productName,
            size: item.size,
            unit: item.unit,
            type: "ADJUSTMENT",
            billNumber: purchase.billNumber,
            billDate: purchase.billDate,
            quantity: -Number(item.quantity),
            stockBefore,
            stockAfter: stock.currentStock,
          },
        ],
        { session }
      );
    }

    await Purchase.deleteOne({ _id: purchase._id }).session(session);

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "Purchase bill deleted successfully",
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    console.error("Delete Purchase Error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to delete purchase bill",
    });
  } finally {
    await session.endSession();
  }
};


// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  createPurchase,
  getPurchases,
  updatePurchase,
  deletePurchase,
};