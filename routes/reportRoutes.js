const express = require("express");

const {
  getReport,
  getMonthlyReport,
} = require("../controllers/reportController");

const router = express.Router();

router.get("/monthly", getMonthlyReport);
router.get("/", getReport);

module.exports = router;