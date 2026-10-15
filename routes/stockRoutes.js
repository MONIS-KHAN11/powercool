const express = require('express');


const {
  getStock,
  getStockHistory,
} = require('../controllers/stockController');

const router = express.Router();

router.get('/', getStock);
router.get('/history', getStockHistory);

module.exports = router;