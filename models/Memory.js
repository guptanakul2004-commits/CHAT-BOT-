const mongoose = require('mongoose');

const memorySchema = new mongoose.Schema({
  userId: String,
  memory: String,
});

module.exports = mongoose.model(
  'Memory',
  memorySchema
);
