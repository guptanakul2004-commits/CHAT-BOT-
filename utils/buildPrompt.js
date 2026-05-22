const { getMemories } = require('../controllers/memoryController');

exports.buildPromptWithMemory = async (
  userId,
  prompt
) => {
  const memories =
    await getMemories(userId);

  const memoryText = memories
    .map((m) => m.memory)
    .join('\n');

  const finalPrompt = `
User Memories:
${memoryText}

Current Prompt:
${prompt}
`;

  return finalPrompt;
};
