const Sentiment = require('sentiment');
const NewsAPI = require('newsapi');

const sentiment = new Sentiment();
const newsapi = new NewsAPI(process.env.NEWS_API_KEY || 'demo');

/**
 * Analyze market sentiment from news headlines
 */
exports.analyzeNews = (headlines) => {
  if (!headlines || headlines.length === 0) {
    return {
      sentiment: 'Neutral',
      score: 0,
      confidence: 0.5,
      emoji: '➡️'
    };
  }

  const scores = headlines.map(h => {
    const result = sentiment.analyze(h);
    return result.score;
  });

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const confidence = Math.min(1, Math.abs(avg) / 5);

  let sentimentType = 'Neutral';
  let emoji = '➡️';

  if (avg > 0.5) {
    sentimentType = 'Bullish';
    emoji = '📈';
  } else if (avg < -0.5) {
    sentimentType = 'Bearish';
    emoji = '📉';
  }

  return {
    sentiment: sentimentType,
    score: avg.toFixed(2),
    confidence: (confidence * 100).toFixed(0),
    emoji: emoji,
    headlines: headlines.slice(0, 3)
  };
};

/**
 * Fetch and analyze news for a ticker
 */
exports.fetchTickerNews = async (ticker) => {
  try {
    const response = await newsapi.v2.everything({
      q: ticker,
      sortBy: 'publishedAt',
      language: 'en',
      pageSize: 5
    });

    const headlines = response.articles.map(a => a.title);
    const analysis = exports.analyzeNews(headlines);

    return {
      success: true,
      ticker: ticker,
      newsCount: response.articles.length,
      articles: response.articles.slice(0, 3),
      analysis: analysis
    };
  } catch (err) {
    console.error('News API Error:', err.message);
    return {
      success: false,
      error: 'Could not fetch news. Using demo sentiment.',
      analysis: {
        sentiment: 'Neutral',
        score: 0,
        confidence: 50,
        emoji: '➡️'
      }
    };
  }
};

/**
 * Quick sentiment score (0-100)
 */
exports.getSentimentScore = (headlines) => {
  const analysis = exports.analyzeNews(headlines);
  const score = parseFloat(analysis.score);
  // Convert from -5 to +5 range to 0-100
  return Math.round((score + 5) * 10);
};
