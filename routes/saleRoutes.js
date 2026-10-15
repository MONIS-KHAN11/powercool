
const express = require('express');

const {
  createSale,
  getSales,
  deleteSale,
} = require('../controllers/saleController');

const router = express.Router();

router.post('/', createSale);
router.get('/', getSales);
router.delete('/:id', deleteSale);

module.exports = router;