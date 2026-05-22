const express = require('express');
const router = express.Router();

const multer = require('multer');
const pdfParse = require('pdf-parse');
const fs = require('fs');

const upload = multer({
  dest: 'uploads/',
});

router.post(
  '/',
  upload.single('pdf'),
  async (req, res) => {
    const dataBuffer =
      fs.readFileSync(req.file.path);

    const pdfData =
      await pdfParse(dataBuffer);

    res.json({
      text: pdfData.text,
    });
  }
);

module.exports = router;
