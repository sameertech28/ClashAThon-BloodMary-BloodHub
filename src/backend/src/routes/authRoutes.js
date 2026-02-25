const express = require("express");
const router = express.Router();
const { login, registerDonor, registerHospital } = require("../controllers/authController");

router.post("/login", login);
router.post("/register-donor", registerDonor);
router.post("/register-hospital", registerHospital);

module.exports = router;
