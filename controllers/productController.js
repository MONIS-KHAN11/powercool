const Product = require('../models/Product');

// ==========================================
// CREATE PRODUCT
// ==========================================

const createProduct = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide product name',
      });
    }

    const productName = name.trim();

    // Check duplicate product name
    const existingProduct = await Product.findOne({
      name: {
        $regex: `^${productName.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&'
        )}$`,
        $options: 'i',
      },
    });

    if (existingProduct) {
      return res.status(409).json({
        success: false,
        message: 'Product already exists',
        product: existingProduct,
      });
    }

    const product = await Product.create({
      name: productName,
    });

    return res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product,
    });
  } catch (error) {
    console.error('Create Product Error:', error.message);

    return res.status(500).json({
      success: false,
      message: 'Failed to create product',
    });
  }
};

// ==========================================
// GET PRODUCTS
// ==========================================

const getProducts = async (req, res) => {
  try {
    const {
      search = '',
      page = 1,
      limit = 20,
    } = req.query;

    const pageNumber = Math.max(
      Number(page) || 1,
      1
    );

    const limitNumber = Math.min(
      Math.max(Number(limit) || 20, 1),
      100
    );

    const skip = (pageNumber - 1) * limitNumber;

    const filter = {};

    if (search.trim()) {
      const escapedSearch = search.trim().replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      );

      filter.name = {
        $regex: escapedSearch,
        $options: 'i',
      };
    }

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),

      Product.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      products,
      data: products,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    console.error('Get Products Error:', error.message);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
    });
  }
};

module.exports = {
  createProduct,
  getProducts,
};