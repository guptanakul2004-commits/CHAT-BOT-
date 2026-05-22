const { routePrompt } = require('../utils/routePrompt');

exports.chat = async (req, res) => {
  const { prompt } = req.body;

  const agent = routePrompt(prompt);

  let reply = '';

  switch (agent) {
    case 'finance':
      reply = 'Finance agent activated';
      break;

    case 'coding':
      reply = 'Coding agent activated';
      break;

    default:
      reply = 'General AI activated';
  }

  res.json({
    agent,
    reply,
  });
};
