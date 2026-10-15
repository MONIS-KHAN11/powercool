
const mongoose = require('mongoose');

const stockSchema = new mongoose.Schema(
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
      unique: true,
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
    currentStock: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { timestamps: true }
);

stockSchema.index({ productId: 1, size: 1, unit: 1 });

module.exports = mongoose.model('Stock', stockSchema);
