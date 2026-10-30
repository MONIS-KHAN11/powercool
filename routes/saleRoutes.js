
const express = require('express');

const {
  createSale,
  getSales,
  getSaleById,
  deleteSale,
} = require('../controllers/saleController');


const router = express.Router();

router.get('/:id', getSaleById);
router.post('/', createSale);
router.get('/', getSales);
router.delete('/:id', deleteSale);

module.exports = router;