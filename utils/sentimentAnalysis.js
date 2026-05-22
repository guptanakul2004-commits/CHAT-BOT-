const Sentiment = require('sentiment');

const sentiment = new Sentiment();

exports.analyzeSentiment = (
  text
) => {
  return sentiment.analyze(text);
};
