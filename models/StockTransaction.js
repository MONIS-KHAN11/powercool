const mongoose = require("mongoose");

const stockTransactionSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },

    productSizeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductSize",
      required: true,
    },

    productName: {
      type: String,
      required: true,
      trim: true,
    },

    size: {
      type: String,
      required: true,
      trim: true,
    },

    unit: {
      type: String,
      required: true,
      enum: ["PCS", "KG", "FEET", "METER", "GRAM"],
    },

    type: {
      type: String,
      required: true,
      enum: ["PURCHASE", "SALE", "ADJUSTMENT"],
      index: true,
    },

    // Purchase ya Sale bill ka database ID
    billId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    // Bill kis collection ka hai
    billType: {
      type: String,
      enum: ["PURCHASE", "SALE"],
      default: null,
      index: true,
    },

    // Deleted/old bill transactions ko totals se exclude karne ke liye
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    billNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    billDate: {
      type: Date,
      index: true,
    },

    quantity: {
      type: Number,
      required: true,
    },

    stockBefore: {
      type: Number,
      required: true,
    },

    stockAfter: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

stockTransactionSchema.index({ productId: 1, createdAt: -1 });
stockTransactionSchema.index({ createdAt: -1 });
stockTransactionSchema.index({ billId: 1, billType: 1, isActive: 1 });

module.exports = mongoose.model(
  "StockTransaction",
  stockTransactionSchema
);