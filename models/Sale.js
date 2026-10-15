
const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema(
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

const saleSchema = new mongoose.Schema(
  {
    billNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    billDate: {
      type: Date,
      required: true,
    },

    customerName: {
      type: String,
      trim: true,
      default: '',
    },

    items: {
      type: [saleItemSchema],
      required: true,
      validate: {
        validator: (items) => items.length > 0,
        message: 'Sale bill must contain at least one item',
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
  { timestamps: true }
);

saleSchema.index({ billDate: -1 });
saleSchema.index({ customerName: 1 });
saleSchema.index({ 'items.productId': 1 });
saleSchema.index({ 'items.productSizeId': 1 });

module.exports = mongoose.model('Sale', saleSchema);
