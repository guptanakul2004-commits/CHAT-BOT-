exports.routePrompt = (prompt) => {
  prompt = prompt.toLowerCase();

  if (
    prompt.includes('stock') ||
    prompt.includes('market')
  ) {
    return 'finance';
  }

  if (
    prompt.includes('code') ||
    prompt.includes('bug')
  ) {
    return 'coding';
  }

  if (
    prompt.includes('resume')
  ) {
    return 'resume';
  }

  return 'general';
};
