const express = require('express');

const {
  createProduct,
  getProducts,
} = require('../controllers/productController');

const {
  createProductSize,
  getProductSizes,
} = require('../controllers/productSizeController');

const router = express.Router();

// Product APIs
router.post('/', createProduct);
router.get('/', getProducts);

// Product Size APIs
router.post('/sizes', createProductSize);
router.get('/sizes', getProductSizes);

module.exports = router;