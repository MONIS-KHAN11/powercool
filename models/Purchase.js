const mongoose = require('mongoose');

const purchaseItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },

    productSizeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductSize',
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
      enum: ['PCS', 'KG', 'FEET', 'METER', 'GRAM'],
    },

    quantity: {
      type: Number,
      required: true,
      min: 0.001,
    },
  },
  { _id: true }
);

const purchaseSchema = new mongoose.Schema(
  {
    billNumber: {
      type: String,
      required: true,
      trim: true,
    },
    
    billDate: {
      type: Date,
      required: true,
    },

    supplierName: {
      type: String,
      trim: true,
      default: '',
    },

    items: {
      type: [purchaseItemSchema],
      required: true,
      validate: {
        validator: (items) => items.length > 0,
        message:
          'Purchase bill must contain at least one item',
      },
    },

    totalProducts: {
      type: Number,
      required: true,
      min: 1,
    },

    totalQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

purchaseSchema.index({ billDate: -1 });
purchaseSchema.index({ supplierName: 1 });
purchaseSchema.index({ 'items.productId': 1 });

module.exports = mongoose.model(
  'Purchase',
  purchaseSchema
);