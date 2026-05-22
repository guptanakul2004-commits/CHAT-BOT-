const Memory = require('../models/Memory');

exports.saveMemory = async (
  userId,
  text
) => {
  await Memory.create({
    userId,
    memory: text,
  });
};

exports.getMemories = async (
  userId
) => {
  return await Memory.find({ userId });
};
