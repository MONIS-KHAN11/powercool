const Product = require('../models/Product');
const ProductSize = require('../models/ProductSize');

// ==========================================
// CREATE PRODUCT SIZE
// ==========================================

const createProductSize = async (req, res) => {
  try {
    const { productId, size, unit } = req.body;

    if (!productId || !size?.trim() || !unit) {
      return res.status(400).json({
        success: false,
        message: 'Product, size and unit are required',
      });
    }

    const validUnits = ['PCS', 'KG', 'FEET', 'METER', 'GRAM'];

    if (!validUnits.includes(unit)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid unit',
      });
    }

    if (!/^[0-9a-fA-F]{24}$/.test(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID',
      });
    }

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    const existingSize = await ProductSize.findOne({
      productId,
      size: {
        $regex: `^${size.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
        $options: 'i',
      },
    });

    if (existingSize) {
      return res.status(409).json({
        success: false,
        message: 'This size already exists for this product',
        productSize: existingSize,
      });
    }

    const productSize = await ProductSize.create({
      productId,
      size: size.trim(),
      unit,
    });

    return res.status(201).json({
      success: true,
      message: 'Product size created successfully',
      productSize,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'This size already exists for this product',
      });
    }

    console.error('Create Product Size Error:', error.message);

    return res.status(500).json({
      success: false,
      message: 'Failed to create product size',
    });
  }
};

// ==========================================
// GET SIZES
// ==========================================

const getProductSizes = async (req, res) => {
  try {
    const { productId, search = '' } = req.query;

    const filter = {};

    if (productId) {
      if (!/^[0-9a-fA-F]{24}$/.test(productId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid product ID',
        });
      }

      filter.productId = productId;
    }

    if (search.trim()) {
      filter.size = {
        $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        $options: 'i',
      };
    }

    const productSizes = await ProductSize.find(filter)
      .populate('productId', 'name')
      .sort({ size: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      productSizes,
      data: productSizes,
    });
  } catch (error) {
    console.error('Get Product Sizes Error:', error.message);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch product sizes',
    });
  }
};

module.exports = {
  createProductSize,
  getProductSizes,
};