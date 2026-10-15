const mongoose = require('mongoose');

const productSizeSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
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
  },
  {
    timestamps: true,
  }
);

// Same product ke andar same size duplicate nahi hogi
productSizeSchema.index(
  { productId: 1, size: 1 },
  { unique: true }
);

module.exports = mongoose.model('ProductSize', productSizeSchema);